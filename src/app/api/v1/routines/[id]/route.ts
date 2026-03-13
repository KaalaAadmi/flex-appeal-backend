import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Routine } from "@/models/Routine";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { badRequest, notFound, internalError } from "@/lib/errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { id } = await params;

    await connectDB();
    const routine = await Routine.findOne({
      _id: id,
      userId: auth.clerkId,
    }).lean();

    if (!routine) {
      return notFound("Routine not found");
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
    console.error("Error in GET /routines/[id]:", error);
    return internalError();
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { id } = await params;
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

    const routine = await Routine.findOneAndUpdate(
      { _id: id, userId: auth.clerkId },
      {
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
      },
      { new: true },
    ).lean();

    if (!routine) {
      return notFound("Routine not found");
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
    console.error("Error in PUT /routines/[id]:", error);
    return internalError();
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { id } = await params;
    const body = await req.json();

    // Only allow specific fields to be updated via PATCH
    const allowedFields = [
      "name",
      "cycleStartDay",
      "days",
      "hasWarmup",
      "warmupType",
      "warmupDurationMinutes",
      "hasCardio",
      "cardioType",
      "cardioSegments",
    ];

    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updateData[key] = body[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest("No valid fields provided for update");
    }

    await connectDB();

    const routine = await Routine.findOneAndUpdate(
      { _id: id, userId: auth.clerkId },
      { $set: updateData },
      { new: true },
    ).lean();

    if (!routine) {
      return notFound("Routine not found");
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
    console.error("Error in PATCH /routines/[id]:", error);
    return internalError();
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { id } = await params;

    await connectDB();

    const routine = await Routine.findOneAndDelete({
      _id: id,
      userId: auth.clerkId,
    });

    if (!routine) {
      return notFound("Routine not found");
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Error in DELETE /routines/[id]:", error);
    return internalError();
  }
}
