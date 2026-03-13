import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Routine, IRoutine } from "@/models/Routine";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { notFound, internalError } from "@/lib/errors";

/**
 * GET /api/v1/routines/active
 *
 * Returns the user's currently active routine.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    await connectDB();

    // Search for active routine — also check legacy "isActive" field
    // in case documents were created before the field rename
    let routine = await Routine.findOne({
      userId: auth.clerkId,
      active: true,
    }).lean<IRoutine>();

    if (!routine) {
      // Fallback: check for legacy isActive field
      routine = await Routine.findOne({
        userId: auth.clerkId,
        isActive: true,
      } as Record<string, unknown>).lean<IRoutine>();

      // If found with legacy field, migrate it
      if (routine) {
        await Routine.updateOne(
          { _id: routine._id },
          { $set: { active: true }, $unset: { isActive: "" } },
        );
      }
    }

    if (!routine) {
      return notFound("No active routine found");
    }

    return Response.json({
      id: routine._id,
      name: routine.name,
      templateId: routine.templateId,
      cycleStartDay: routine.cycleStartDay,
      active: routine.active,
      days: routine.days,
      hasWarmup: routine.hasWarmup,
      warmupType: routine.warmupType,
      warmupDurationMinutes: routine.warmupDurationMinutes,
      hasCardio: routine.hasCardio,
      cardioType: routine.cardioType,
      cardioSegments: routine.cardioSegments,
      createdAt: routine.createdAt,
      updatedAt: routine.updatedAt,
    });
  } catch (error) {
    console.error("Error in GET /routines/active:", error);
    return internalError();
  }
}
