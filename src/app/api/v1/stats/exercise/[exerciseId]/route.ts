import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Workout, IWorkout } from "@/models/Workout";
import { Exercise } from "@/models/Exercise";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { notFound, internalError } from "@/lib/errors";

interface RouteParams {
  params: Promise<{ exerciseId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { exerciseId } = await params;

    await connectDB();

    // Look up the exercise to get its name
    const exercise = await Exercise.findById(exerciseId).lean();
    if (!exercise) {
      return notFound("Exercise not found");
    }

    // Find all workouts that include this exercise
    const workouts = await Workout.find({
      userId: auth.clerkId,
      "exercises.exerciseId": exerciseId,
    })
      .sort({ date: -1 })
      .lean<IWorkout[]>();

    // Build history data
    let prWeight = 0;
    let prReps = 0;
    let prDate: Date | null = null;

    const history = workouts.map((w) => {
      // Find the matching exercise entry in this workout
      const matchedExercise = w.exercises.find(
        (e: { exerciseId?: string }) => e.exerciseId === exerciseId,
      );

      let bestWeight = 0;
      let bestReps = 0;
      let totalVolume = 0;

      if (matchedExercise && matchedExercise.sets) {
        for (const set of matchedExercise.sets) {
          const w2 = set.weight || 0;
          const r = set.reps || 0;
          totalVolume += w2 * r;

          // Track best set by weight
          if (w2 > bestWeight || (w2 === bestWeight && r > bestReps)) {
            bestWeight = w2;
            bestReps = r;
          }
        }
      }

      // Check if this is a PR
      if (
        bestWeight > prWeight ||
        (bestWeight === prWeight && bestReps > prReps)
      ) {
        prWeight = bestWeight;
        prReps = bestReps;
        prDate = w.date;
      }

      return {
        date: w.date.toISOString().split("T")[0],
        bestSet: { weight: bestWeight, reps: bestReps },
        totalVolume,
      };
    });

    return Response.json({
      exerciseId,
      exerciseName: exercise.name,
      sessions: workouts.length,
      pr: prDate ? { weight: prWeight, reps: prReps, date: prDate } : null,
      history,
    });
  } catch (error) {
    console.error("Error in GET /stats/exercise/[exerciseId]:", error);
    return internalError();
  }
}
