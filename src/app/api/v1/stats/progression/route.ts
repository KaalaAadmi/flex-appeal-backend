import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Workout, IWorkout } from "@/models/Workout";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { internalError } from "@/lib/errors";

/**
 * GET /api/v1/stats/progression?weeks=8
 * Returns weight progression for ALL exercises the user has trained,
 * grouped by exercise, with daily data points.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const weeks = parseInt(searchParams.get("weeks") || "8");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - weeks * 7);

    await connectDB();

    const workouts = await Workout.find({
      userId: auth.clerkId,
      date: { $gte: startDate },
    })
      .sort({ date: 1 })
      .lean<IWorkout[]>();

    // Build per-exercise progression
    const exerciseMap: Record<
      string,
      {
        exerciseId: string;
        name: string;
        equipment: string;
        sessions: {
          date: string;
          bestWeight: number;
          bestReps: number;
          totalVolume: number;
          sets: { weight: number; reps: number }[];
        }[];
      }
    > = {};

    for (const w of workouts) {
      if (!w.exercises || !Array.isArray(w.exercises)) continue;
      const dateStr = new Date(w.date).toISOString().split("T")[0];

      for (const ex of w.exercises) {
        const key = ex.exerciseId || ex.name; // fallback to name if no exerciseId
        if (!exerciseMap[key]) {
          exerciseMap[key] = {
            exerciseId: ex.exerciseId || "",
            name: ex.name,
            equipment: ex.equipment || "",
            sessions: [],
          };
        }

        let bestWeight = 0;
        let bestReps = 0;
        let totalVolume = 0;
        const setDetails: { weight: number; reps: number }[] = [];

        if (ex.sets && Array.isArray(ex.sets)) {
          for (const set of ex.sets) {
            const w2 = set.weight || 0;
            const r = set.reps || 0;
            totalVolume += w2 * r;
            setDetails.push({ weight: w2, reps: r });

            if (w2 > bestWeight || (w2 === bestWeight && r > bestReps)) {
              bestWeight = w2;
              bestReps = r;
            }
          }
        }

        exerciseMap[key].sessions.push({
          date: dateStr,
          bestWeight,
          bestReps,
          totalVolume,
          sets: setDetails,
        });
      }
    }

    // Convert to array, sort by exercise name
    const progression = Object.values(exerciseMap)
      .filter((e) => e.sessions.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ weeks, progression });
  } catch (error) {
    console.error("Error in GET /stats/progression:", error);
    return internalError();
  }
}
