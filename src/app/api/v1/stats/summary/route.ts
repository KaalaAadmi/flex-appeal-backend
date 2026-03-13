import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Workout, IWorkout } from "@/models/Workout";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { internalError } from "@/lib/errors";

function getPeriodStartDate(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "year":
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case "all":
    default:
      return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "all";

    await connectDB();

    const filter: Record<string, unknown> = { userId: auth.clerkId };
    const periodStart = getPeriodStartDate(period);
    if (periodStart) {
      filter.date = { $gte: periodStart };
    }

    const workouts = await Workout.find(filter)
      .sort({ date: -1 })
      .lean<IWorkout[]>();

    const totalWorkouts = workouts.length;
    let totalDurationSeconds = 0;
    let totalWeight = 0;
    let totalSets = 0;
    let totalReps = 0;
    let totalPrs = 0;
    let totalEstCalories = 0;
    const muscleCount: Record<string, number> = {};

    for (const w of workouts) {
      totalDurationSeconds += w.durationSeconds || 0;
      totalWeight += w.stats?.totalWeight || 0;
      totalSets += w.stats?.workingSets || 0;
      totalPrs += w.stats?.prs || 0;
      totalEstCalories += w.stats?.estCalories || 0;

      if (w.exercises && Array.isArray(w.exercises)) {
        for (const ex of w.exercises) {
          if (ex.sets && Array.isArray(ex.sets)) {
            for (const set of ex.sets) {
              totalReps += set.reps || 0;
            }
          }
          // Count exercise type/tags as muscle groups
          if (ex.tags && Array.isArray(ex.tags)) {
            for (const tag of ex.tags) {
              muscleCount[tag] = (muscleCount[tag] || 0) + 1;
            }
          }
        }
      }
    }

    // Compute total duration string
    const totalMinutes = Math.round(totalDurationSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const totalDuration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    // Compute average workout duration
    const avgMinutes =
      totalWorkouts > 0 ? Math.round(totalMinutes / totalWorkouts) : 0;
    const avgWorkoutDuration = `${avgMinutes}m`;

    // Compute streaks (consecutive days with workouts)
    let currentStreak = 0;
    let longestStreak = 0;

    if (workouts.length > 0) {
      // Get unique workout dates (just the date part)
      const dateSet = new Set<string>();
      for (const w of workouts) {
        const d = new Date(w.date);
        dateSet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      }
      const workoutDates: string[] = Array.from(dateSet).sort().reverse();

      // Current streak: check from today backwards
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;

      if (workoutDates[0] === todayStr || workoutDates[0] === yesterdayStr) {
        let checkDate = workoutDates[0] === todayStr ? today : yesterday;
        for (const dateStr of workoutDates) {
          const checkStr = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
          if (dateStr === checkStr) {
            currentStreak++;
            checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
          } else {
            break;
          }
        }
      }

      // Longest streak
      let streak = 1;
      for (let i = 0; i < workoutDates.length - 1; i++) {
        const parts1 = workoutDates[i].split("-").map(Number);
        const parts2 = workoutDates[i + 1].split("-").map(Number);
        const d1 = new Date(parts1[0], parts1[1], parts1[2]);
        const d2 = new Date(parts2[0], parts2[1], parts2[2]);
        const diffDays = Math.round(
          (d1.getTime() - d2.getTime()) / (24 * 60 * 60 * 1000),
        );
        if (diffDays === 1) {
          streak++;
        } else {
          longestStreak = Math.max(longestStreak, streak);
          streak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, streak);
    }

    // Workouts per week
    let weeksInPeriod = 1;
    if (periodStart) {
      weeksInPeriod = Math.max(
        1,
        Math.round(
          (Date.now() - periodStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
        ),
      );
    } else if (workouts.length > 0) {
      const oldest = new Date(workouts[workouts.length - 1].date);
      weeksInPeriod = Math.max(
        1,
        Math.round((Date.now() - oldest.getTime()) / (7 * 24 * 60 * 60 * 1000)),
      );
    }
    const workoutsPerWeek = parseFloat(
      (totalWorkouts / weeksInPeriod).toFixed(1),
    );

    // Most trained muscle
    const mostTrainedMuscle =
      Object.entries(muscleCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return Response.json({
      totalWorkouts,
      totalDuration,
      totalWeight,
      totalSets,
      totalReps,
      avgWorkoutDuration,
      currentStreak,
      longestStreak,
      prs: totalPrs,
      estimatedCalories: totalEstCalories,
      workoutsPerWeek,
      mostTrainedMuscle,
      period,
    });
  } catch (error) {
    console.error("Error in GET /stats/summary:", error);
    return internalError();
  }
}
