import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Workout, IWorkout } from "@/models/Workout";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { badRequest, internalError } from "@/lib/errors";

function computeStats(body: {
  exercises?: { sets?: { weight?: number; reps?: number }[] }[];
  durationSeconds?: number;
  caloriesBurned?: number;
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

  // Use Apple Health calories if provided, otherwise fall back to rough estimate
  const estCalories = body.caloriesBurned
    ? Math.round(body.caloriesBurned)
    : Math.round(workingSets * 5 + totalWeight * 0.05 + durationMinutes * 3);

  return {
    duration,
    workingSets,
    totalWeight,
    estCalories,
    prs: 0, // PRs can be computed by comparing with historical data
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    await connectDB();

    const filter: Record<string, unknown> = { userId: auth.clerkId };

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) dateFilter.$lte = new Date(to);
      filter.date = dateFilter;
    }

    const [workouts, total] = await Promise.all([
      Workout.find(filter)
        .sort({ date: -1 })
        .skip(offset)
        .limit(limit)
        .lean<IWorkout[]>(),
      Workout.countDocuments(filter),
    ]);

    return Response.json({
      workouts: workouts.map((w) => ({
        id: w._id,
        title: w.title,
        type: w.type,
        date: w.date,
        description: w.description,
        exerciseNames: w.exerciseNames,
        exercises: w.exercises,
        warmup: w.warmup,
        cardio: w.cardio,
        durationSeconds: w.durationSeconds,
        routineId: w.routineId,
        stats: w.stats,
        createdAt: w.createdAt,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error in GET /workouts:", error);
    return internalError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const body = await req.json();
    const { title, type, date, exercises } = body;

    if (!title || !type || !date || !exercises) {
      return badRequest(
        "Missing required fields: title, type, date, exercises",
      );
    }

    await connectDB();

    // Auto-compute exercise names from exercises array
    const exerciseNames = (exercises as { name: string }[]).map((e) => e.name);

    // Auto-compute stats
    const stats = computeStats(body);

    const workout = await Workout.create({
      userId: auth.clerkId,
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
    });

    return Response.json(
      {
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
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in POST /workouts:", error);
    return internalError();
  }
}
