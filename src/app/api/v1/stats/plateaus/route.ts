import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Workout, IWorkout } from "@/models/Workout";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { internalError } from "@/lib/errors";

/**
 * GET /api/v1/stats/plateaus
 *
 * Detects exercises where the user has lifted the SAME best weight
 * for 3 or more consecutive workout sessions.
 *
 * Returns:
 * {
 *   plateaus: [
 *     {
 *       exerciseName: string,
 *       equipment: string,
 *       staleWeight: number,
 *       staleSessions: number,     // how many consecutive sessions at this weight
 *       lastSessionDate: string,
 *       suggestion: string,        // friendly nudge
 *     }
 *   ]
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    await connectDB();

    // Look back 12 weeks to find patterns
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 12 * 7);

    const workouts = await Workout.find({
      userId: auth.clerkId,
      date: { $gte: startDate },
    })
      .sort({ date: 1 })
      .lean<IWorkout[]>();

    // Build per-exercise session list (best weight per session)
    const exerciseMap: Record<
      string,
      {
        name: string;
        equipment: string;
        sessions: { date: string; bestWeight: number }[];
      }
    > = {};

    for (const w of workouts) {
      if (!w.exercises || !Array.isArray(w.exercises)) continue;
      const dateStr = new Date(w.date).toISOString().split("T")[0];

      for (const ex of w.exercises) {
        const key = ex.name.toLowerCase().trim();
        if (!exerciseMap[key]) {
          exerciseMap[key] = {
            name: ex.name,
            equipment: ex.equipment || "",
            sessions: [],
          };
        }

        let bestWeight = 0;
        if (ex.sets && Array.isArray(ex.sets)) {
          for (const set of ex.sets) {
            if ((set.weight || 0) > bestWeight) {
              bestWeight = set.weight || 0;
            }
          }
        }

        if (bestWeight > 0) {
          exerciseMap[key].sessions.push({ date: dateStr, bestWeight });
        }
      }
    }

    // Detect plateaus: same bestWeight for >= 3 consecutive sessions
    const plateaus: {
      exerciseName: string;
      equipment: string;
      staleWeight: number;
      staleSessions: number;
      lastSessionDate: string;
      suggestion: string;
    }[] = [];

    for (const ex of Object.values(exerciseMap)) {
      if (ex.sessions.length < 3) continue;

      // Check trailing consecutive sessions with same weight
      const lastIdx = ex.sessions.length - 1;
      const lastWeight = ex.sessions[lastIdx].bestWeight;
      let streak = 1;

      for (let i = lastIdx - 1; i >= 0; i--) {
        if (ex.sessions[i].bestWeight === lastWeight) {
          streak++;
        } else {
          break;
        }
      }

      if (streak >= 3) {
        // Calculate a suggested increment
        const increment = lastWeight <= 20 ? 2.5 : 5;
        plateaus.push({
          exerciseName: ex.name,
          equipment: ex.equipment,
          staleWeight: lastWeight,
          staleSessions: streak,
          lastSessionDate: ex.sessions[lastIdx].date,
          suggestion: `You've lifted ${lastWeight} kg for ${streak} consecutive sessions. Try increasing to ${lastWeight + increment} kg or adding more reps.`,
        });
      }
    }

    return Response.json({ plateaus });
  } catch (error) {
    console.error("Error in GET /stats/plateaus:", error);
    return internalError();
  }
}
