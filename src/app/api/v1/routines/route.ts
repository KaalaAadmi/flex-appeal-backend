import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Routine, IRoutine } from "@/models/Routine";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { badRequest, internalError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    await connectDB();

    const routines = await Routine.find({ userId: auth.clerkId })
      .sort({ updatedAt: -1 })
      .lean<IRoutine[]>();

    // Migrate any legacy "isActive" fields to "active"
    for (const r of routines) {
      const doc = r as IRoutine & { isActive?: boolean };
      if (doc.isActive !== undefined) {
        await Routine.updateOne(
          { _id: r._id },
          {
            $set: { active: doc.isActive },
            $unset: { isActive: "" },
          },
        );
        r.active = doc.isActive;
      }
    }

    return Response.json({
      routines: routines.map((r) => ({
        id: r._id,
        name: r.name,
        templateId: r.templateId,
        cycleStartDay: r.cycleStartDay,
        active: r.active,
        days: r.days,
        hasWarmup: r.hasWarmup,
        warmupType: r.warmupType,
        warmupDurationMinutes: r.warmupDurationMinutes,
        hasCardio: r.hasCardio,
        cardioType: r.cardioType,
        cardioSegments: r.cardioSegments,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error in GET /routines:", error);
    return internalError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const body = await req.json();
    const {
      name,
      templateId,
      cycleStartDay,
      days,
      hasWarmup,
      warmupType,
      warmupDurationMinutes,
      hasCardio,
      cardioType,
      cardioSegments,
    } = body;

    if (!name || !templateId || !cycleStartDay || !days) {
      return badRequest(
        "Missing required fields: name, templateId, cycleStartDay, days",
      );
    }

    await connectDB();

    // Auto-activate the first routine for this user
    const existingCount = await Routine.countDocuments({
      userId: auth.clerkId,
    });
    const shouldBeActive = existingCount === 0;

    const routine = await Routine.create({
      userId: auth.clerkId,
      name,
      templateId,
      cycleStartDay,
      days,
      hasWarmup: hasWarmup || false,
      warmupType: warmupType || null,
      warmupDurationMinutes: warmupDurationMinutes || 0,
      hasCardio: hasCardio || false,
      cardioType: cardioType || null,
      cardioSegments: cardioSegments || [],
      active: shouldBeActive,
    });

    return Response.json(
      {
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
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in POST /routines:", error);
    return internalError();
  }
}
