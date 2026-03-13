import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Routine } from "@/models/Routine";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { badRequest, notFound, internalError } from "@/lib/errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { id } = await params;
    const body = await req.json();
    const { active } = body;

    if (typeof active !== "boolean") {
      return badRequest("Field 'active' must be a boolean");
    }

    await connectDB();

    // Verify the routine exists and belongs to the user
    const routine = await Routine.findOne({
      _id: id,
      userId: auth.clerkId,
    });

    if (!routine) {
      return notFound("Routine not found");
    }

    let previouslyActiveRoutineId: string | null = null;

    if (active) {
      // Deactivate the currently active routine (if any)
      const previouslyActive = await Routine.findOneAndUpdate(
        { userId: auth.clerkId, active: true, _id: { $ne: id } },
        { active: false },
      );
      if (previouslyActive) {
        previouslyActiveRoutineId = previouslyActive._id.toString();
      }
    }

    // Set the requested routine's active state
    routine.active = active;
    await routine.save();

    return Response.json({
      id: routine._id,
      active: routine.active,
      previouslyActiveRoutineId,
    });
  } catch (error) {
    console.error("Error in PUT /routines/[id]/active:", error);
    return internalError();
  }
}
