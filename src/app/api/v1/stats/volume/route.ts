import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Workout, IWorkout } from "@/models/Workout";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { internalError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "month";
    const muscleGroup = searchParams.get("muscleGroup");

    await connectDB();

    // Determine date range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "year":
        startDate = new Date(
          now.getFullYear() - 1,
          now.getMonth(),
          now.getDate(),
        );
        break;
      case "month":
      default:
        startDate = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          now.getDate(),
        );
        break;
    }

    const filter: Record<string, unknown> = {
      userId: auth.clerkId,
      date: { $gte: startDate },
    };

    const workouts = await Workout.find(filter)
      .sort({ date: 1 })
      .lean<IWorkout[]>();

    // Build daily volume data
    const dailyData: Record<string, { volume: number; sets: number }> = {};

    // Initialize all days in range with zero
    const current = new Date(startDate);
    while (current <= now) {
      const dateKey = current.toISOString().split("T")[0];
      dailyData[dateKey] = { volume: 0, sets: 0 };
      current.setDate(current.getDate() + 1);
    }

    for (const w of workouts) {
      const dateKey = new Date(w.date).toISOString().split("T")[0];

      if (w.exercises && Array.isArray(w.exercises)) {
        for (const ex of w.exercises) {
          // If muscleGroup filter is set, only count matching exercises
          if (muscleGroup) {
            const tags = (ex.tags || []) as string[];
            if (
              !tags.some(
                (t: string) => t.toLowerCase() === muscleGroup.toLowerCase(),
              )
            ) {
              continue;
            }
          }

          if (ex.sets && Array.isArray(ex.sets)) {
            for (const set of ex.sets) {
              const volume = (set.weight || 0) * (set.reps || 0);
              if (!dailyData[dateKey]) {
                dailyData[dateKey] = { volume: 0, sets: 0 };
              }
              dailyData[dateKey].volume += volume;
              dailyData[dateKey].sets += 1;
            }
          }
        }
      }
    }

    const data = Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, val]) => ({
        date,
        volume: val.volume,
        sets: val.sets,
      }));

    return Response.json({ data });
  } catch (error) {
    console.error("Error in GET /stats/volume:", error);
    return internalError();
  }
}
