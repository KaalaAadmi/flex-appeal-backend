import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { badRequest, internalError } from "@/lib/errors";

interface ClerkEmailAddress {
  email_address: string;
  verification: { status: string };
}

interface ClerkWebhookUserData {
  id: string;
  email_addresses: ClerkEmailAddress[];
  first_name: string | null;
  last_name: string | null;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkWebhookUserData;
}

export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!WEBHOOK_SECRET) {
    console.error("Missing CLERK_WEBHOOK_SIGNING_SECRET env variable");
    return internalError();
  }

  // Get svix headers for verification
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return badRequest("Missing svix verification headers");
  }

  const body = await req.text();

  // Verify the webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    console.error("Webhook signature verification failed");
    return badRequest("Invalid webhook signature");
  }

  try {
    await connectDB();

    const { type, data } = event;

    if (type === "user.created") {
      const email = data.email_addresses?.[0]?.email_address || "";
      const firstName = data.first_name || "";
      const lastName = data.last_name || "";
      const name = `${firstName} ${lastName}`.trim() || email;

      await User.findOneAndUpdate(
        { clerkId: data.id },
        {
          clerkId: data.id,
          email,
          name,
          firstName,
          lastName,
        },
        { upsert: true, new: true },
      );
    } else if (type === "user.updated") {
      const email = data.email_addresses?.[0]?.email_address || "";
      const firstName = data.first_name || "";
      const lastName = data.last_name || "";
      const name = `${firstName} ${lastName}`.trim() || email;

      await User.findOneAndUpdate(
        { clerkId: data.id },
        { email, name, firstName, lastName },
      );
    } else if (type === "user.deleted") {
      await User.findOneAndDelete({ clerkId: data.id });
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return internalError();
  }
}
