import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Workout, IWorkout } from "@/models/Workout";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { badRequest, internalError } from "@/lib/errors";

/**
 * POST /api/v1/workouts/previous
 * Given a list of exercise names, returns the most recent workout data
 * for each exercise (sets with weight and reps).
 *
 * Body: { exercises: [{ name: string, equipment: string }] }
 *
 * Returns: {
 *   previous: {
 *     [exerciseKey: string]: {
 *       date: string;
 *       sets: { weight: number; reps: number }[];
 *     }
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const body = await req.json();
    const { exercises } = body;

    if (!Array.isArray(exercises) || exercises.length === 0) {
      return badRequest("exercises must be a non-empty array");
    }

    await connectDB();

    // Get the exercise names to search for
    const exerciseNames = exercises.map((e: { name: string }) => e.name);

    // Find the most recent workouts that contain any of these exercises.
    // We fetch enough workouts to likely cover all exercises.
    const recentWorkouts = await Workout.find({
      userId: auth.clerkId,
      exerciseNames: { $in: exerciseNames },
    })
      .sort({ date: -1 })
      .limit(50)
      .lean<IWorkout[]>();

    // For each requested exercise, find the most recent session
    const previous: Record<
      string,
      { date: string; sets: { weight: number; reps: number }[] }
    > = {};

    for (const reqEx of exercises) {
      const name = reqEx.name;
      const equipment = reqEx.equipment || "";

      // Find the most recent workout containing this exercise
      for (const workout of recentWorkouts) {
        if (!workout.exercises) continue;

        const match = workout.exercises.find((wEx) => {
          // Match by name (case-insensitive) and optionally equipment
          const nameMatch = wEx.name.toLowerCase() === name.toLowerCase();
          if (!nameMatch) return false;
          // If equipment is specified on both sides, also match equipment
          if (equipment && wEx.equipment) {
            return wEx.equipment.toLowerCase() === equipment.toLowerCase();
          }
          return true;
        });

        if (match && match.sets && match.sets.length > 0) {
          const key = `${name}||${equipment}`;
          if (!previous[key]) {
            previous[key] = {
              date: new Date(workout.date).toISOString().split("T")[0],
              sets: match.sets.map((s) => ({
                weight: s.weight || 0,
                reps: s.reps || 0,
              })),
            };
          }
          break; // We only need the most recent one
        }
      }
    }

    return Response.json({ previous });
  } catch (error) {
    console.error("Error in POST /workouts/previous:", error);
    return internalError();
  }
}
