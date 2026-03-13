import { verifyToken } from "@clerk/backend";
import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";

export interface AuthResult {
  clerkId: string;
  userId: string; // MongoDB _id
}

/**
 * Verifies the Clerk JWT from the Authorization header and
 * resolves the corresponding database user.
 * Returns null if auth fails.
 */
export async function authenticateRequest(
  req: NextRequest,
): Promise<AuthResult | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    const clerkId = payload.sub;
    if (!clerkId) {
      console.warn("[Auth] Token verified but no sub claim found");
      return null;
    }

    await connectDB();
    const user = await User.findOne({ clerkId }).lean();
    if (!user) {
      console.warn(`[Auth] No DB user found for clerkId: ${clerkId}`);
      return null;
    }

    return {
      clerkId,
      userId: String(user._id),
    };
  } catch (err) {
    console.error("[Auth] Token verification failed:", err);
    return null;
  }
}

/**
 * Helper that returns an unauthorized JSON response.
 */
export function unauthorizedResponse() {
  return Response.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required. Provide a valid Bearer token.",
      },
    },
    { status: 401 },
  );
}
