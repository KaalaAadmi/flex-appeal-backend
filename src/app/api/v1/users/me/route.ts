import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { badRequest, internalError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    await connectDB();
    const user = await User.findOne({ clerkId: auth.clerkId }).lean();

    if (!user) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 },
      );
    }

    return Response.json({
      id: user._id,
      email: user.email,
      name: user.name,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      avatarUrl: user.avatarUrl || null,
      createdAt: user.createdAt,
      preferences: user.preferences || {
        weightUnit: "kg",
        distanceUnit: "km",
      },
      profile: user.profile || {},
      connectedApps: user.connectedApps || {
        appleHealth: { connected: false },
        myFitnessPal: { connected: false },
      },
    });
  } catch (error) {
    console.error("Error in GET /users/me:", error);
    return internalError();
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const body = await req.json();
    const allowedFields = [
      "name",
      "firstName",
      "lastName",
      "avatarUrl",
      "preferences",
      "profile",
      "connectedApps",
    ];
    const updateData: Record<string, unknown> = {};

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        if (
          (key === "preferences" ||
            key === "profile" ||
            key === "connectedApps") &&
          typeof body[key] === "object"
        ) {
          // Merge nested object rather than replacing
          for (const subKey of Object.keys(body[key])) {
            if (
              key === "connectedApps" &&
              typeof body[key][subKey] === "object"
            ) {
              // Handle nested object like connectedApps.appleHealth.connected
              for (const innerKey of Object.keys(body[key][subKey])) {
                updateData[`${key}.${subKey}.${innerKey}`] =
                  body[key][subKey][innerKey];
              }
            } else {
              updateData[`${key}.${subKey}`] = body[key][subKey];
            }
          }
        } else {
          updateData[key] = body[key];
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest("No valid fields provided for update");
    }

    await connectDB();
    const user = await User.findOneAndUpdate(
      { clerkId: auth.clerkId },
      { $set: updateData },
      { new: true },
    ).lean();

    if (!user) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 },
      );
    }

    return Response.json({
      id: user._id,
      email: user.email,
      name: user.name,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      avatarUrl: user.avatarUrl || null,
      createdAt: user.createdAt,
      preferences: user.preferences,
      profile: user.profile || {},
      connectedApps: user.connectedApps || {
        appleHealth: { connected: false },
        myFitnessPal: { connected: false },
      },
    });
  } catch (error) {
    console.error("Error in PATCH /users/me:", error);
    return internalError();
  }
}
