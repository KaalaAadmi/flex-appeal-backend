import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Workout } from "@/models/Workout";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { badRequest, notFound, internalError } from "@/lib/errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function computeStats(body: {
  exercises?: { sets?: { weight?: number; reps?: number }[] }[];
  durationSeconds?: number;
}) {
  let workingSets = 0;
  let totalWeight = 0;

  if (body.exercises && Array.isArray(body.exercises)) {
    for (const exercise of body.exercises) {
      if (exercise.sets && Array.isArray(exercise.sets)) {
        workingSets += exercise.sets.length;
        for (const set of exercise.sets) {
          totalWeight += (set.weight || 0) * (set.reps || 0);
        }
      }
    }
  }

  const durationSeconds = body.durationSeconds || 0;
  const durationMinutes = Math.round(durationSeconds / 60);
  const duration =
    durationMinutes >= 60
      ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
      : `${durationMinutes}m`;

  const estCalories = Math.round(
    workingSets * 5 + totalWeight * 0.05 + durationMinutes * 3,
  );

  return {
    duration,
    workingSets,
    totalWeight,
    estCalories,
    prs: 0,
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { id } = await params;

    await connectDB();
    const workout = await Workout.findOne({
      _id: id,
      userId: auth.clerkId,
    }).lean();

    if (!workout) {
      return notFound("Workout not found");
    }

    return Response.json({
      id: workout._id,
      title: workout.title,
      type: workout.type,
      date: workout.date,
      description: workout.description,
      exerciseNames: workout.exerciseNames,
      exercises: workout.exercises,
      warmup: workout.warmup,
      cardio: workout.cardio,
      durationSeconds: workout.durationSeconds,
      routineId: workout.routineId,
      stats: workout.stats,
      createdAt: workout.createdAt,
    });
  } catch (error) {
    console.error("Error in GET /workouts/[id]:", error);
    return internalError();
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { id } = await params;
    const body = await req.json();
    const { title, type, date, exercises } = body;

    if (!title || !type || !date || !exercises) {
      return badRequest(
        "Missing required fields: title, type, date, exercises",
      );
    }

    await connectDB();

    const exerciseNames = (exercises as { name: string }[]).map((e) => e.name);
    const stats = computeStats(body);

    const workout = await Workout.findOneAndUpdate(
      { _id: id, userId: auth.clerkId },
      {
        title,
        type,
        date: new Date(date),
        description: body.description || "",
        exerciseNames,
        exercises,
        warmup: body.warmup || null,
        cardio: body.cardio || null,
        durationSeconds: body.durationSeconds || 0,
        routineId: body.routineId || null,
        stats,
      },
      { new: true },
    ).lean();

    if (!workout) {
      return notFound("Workout not found");
    }

    return Response.json({
      id: workout._id,
      title: workout.title,
      type: workout.type,
      date: workout.date,
      description: workout.description,
      exerciseNames: workout.exerciseNames,
      exercises: workout.exercises,
      warmup: workout.warmup,
      cardio: workout.cardio,
      durationSeconds: workout.durationSeconds,
      routineId: workout.routineId,
      stats: workout.stats,
      createdAt: workout.createdAt,
    });
  } catch (error) {
    console.error("Error in PUT /workouts/[id]:", error);
    return internalError();
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { id } = await params;

    await connectDB();

    const workout = await Workout.findOneAndDelete({
      _id: id,
      userId: auth.clerkId,
    });

    if (!workout) {
      return notFound("Workout not found");
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Error in DELETE /workouts/[id]:", error);
    return internalError();
  }
}
