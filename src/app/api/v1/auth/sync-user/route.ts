import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { badRequest, conflict, internalError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clerkId, email, firstName, lastName, name } = body;

    if (!clerkId || !email || !name) {
      return badRequest("Missing required fields: clerkId, email, name");
    }

    await connectDB();

    // Check if user already exists
    const existing = await User.findOne({ clerkId });
    if (existing) {
      return conflict("A user with this Clerk ID already exists.");
    }

    const user = await User.create({
      clerkId,
      email,
      name,
      firstName: firstName || "",
      lastName: lastName || "",
    });

    return Response.json(
      {
        id: user._id,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in POST /auth/sync-user:", error);
    return internalError();
  }
}
