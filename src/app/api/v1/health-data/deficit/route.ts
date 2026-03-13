import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { HealthData, IHealthData } from "@/models/HealthData";
import { User } from "@/models/User";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { internalError } from "@/lib/errors";

/**
 * GET /api/v1/health-data/deficit?period=daily|weekly|monthly&from=&to=
 * Returns calorie deficit data grouped by day, week, or month.
 * deficit = caloriesBurned - caloriesConsumed
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "daily";

    // Default ranges
    const now = new Date();
    let defaultFrom: Date;
    switch (period) {
      case "weekly":
        defaultFrom = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000); // 12 weeks
        break;
      case "monthly":
        defaultFrom = new Date(
          now.getFullYear() - 1,
          now.getMonth(),
          now.getDate(),
        ); // 1 year
        break;
      case "daily":
      default:
        defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days
        break;
    }

    const from = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : defaultFrom;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : now;

    await connectDB();

    // Fetch user profile for goalType and macro goal info
    const user = await User.findOne({ clerkId: auth.clerkId })
      .select(
        "profile.goalType profile.dailyCalorieGoal profile.dailyProteinGoal profile.weightKg profile.heightCm profile.age profile.gender profile.weeklyWeightChange",
      )
      .lean();
    const goalType = user?.profile?.goalType || null;

    // Compute daily macro goals from the profile
    let macroGoals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    } | null = null;
    const p = user?.profile;
    if (p?.dailyCalorieGoal && p?.dailyProteinGoal) {
      const proteinCals = p.dailyProteinGoal * 4;
      // Fat = 25% of total calories, remainder = carbs
      const fatCals = p.dailyCalorieGoal * 0.25;
      const carbCals = p.dailyCalorieGoal - proteinCals - fatCals;
      macroGoals = {
        calories: p.dailyCalorieGoal,
        protein: p.dailyProteinGoal,
        carbs: Math.round(Math.max(carbCals, 0) / 4),
        fat: Math.round(fatCals / 9),
      };
    }

    // Fetch all health data in the range
    const entries = await HealthData.find({
      userId: auth.clerkId,
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1 })
      .lean<IHealthData[]>();

    // Merge entries from different sources for the same date
    const byDate: Record<
      string,
      {
        caloriesBurned: number;
        caloriesConsumed: number;
        activeCalories: number;
        steps: number;
        protein: number;
        carbs: number;
        fat: number;
      }
    > = {};

    for (const entry of entries) {
      const dateKey = new Date(entry.date).toISOString().split("T")[0];
      if (!byDate[dateKey]) {
        byDate[dateKey] = {
          caloriesBurned: 0,
          caloriesConsumed: 0,
          activeCalories: 0,
          steps: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        };
      }

      const day = byDate[dateKey];

      // Apple Health provides burned data
      if (entry.caloriesBurned) day.caloriesBurned = entry.caloriesBurned;
      if (entry.activeCaloriesBurned)
        day.activeCalories = entry.activeCaloriesBurned;
      if (entry.stepCount) day.steps = entry.stepCount;

      // MyFitnessPal provides consumed data (via Apple Health)
      if (entry.caloriesConsumed) day.caloriesConsumed = entry.caloriesConsumed;
      if (entry.proteinGrams) day.protein = entry.proteinGrams;
      if (entry.carbsGrams) day.carbs = entry.carbsGrams;
      if (entry.fatGrams) day.fat = entry.fatGrams;
    }

    // Build daily deficit data
    const dailyData = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, val]) => {
        // If we have macros but no direct caloriesConsumed value (or it's 0),
        // compute it: protein 4 kcal/g + carbs 4 kcal/g + fat 9 kcal/g
        const hasMacros = val.protein > 0 || val.carbs > 0 || val.fat > 0;
        const macroCalories = hasMacros
          ? Math.round(val.protein * 4 + val.carbs * 4 + val.fat * 9)
          : 0;

        // Use the direct value if available; otherwise fall back to macro-computed value
        const caloriesConsumed =
          val.caloriesConsumed > 0 ? val.caloriesConsumed : macroCalories;

        return {
          date,
          caloriesBurned: val.caloriesBurned,
          caloriesConsumed,
          caloriesFromMacros: macroCalories, // always include for transparency
          deficit: val.caloriesBurned - caloriesConsumed,
          activeCalories: val.activeCalories,
          steps: val.steps,
          protein: val.protein,
          carbs: val.carbs,
          fat: val.fat,
        };
      });

    // Group if needed
    if (period === "weekly") {
      const weeklyData = groupByWeek(dailyData);
      return Response.json({ period, goalType, macroGoals, data: weeklyData });
    }

    if (period === "monthly") {
      const monthlyData = groupByMonth(dailyData);
      return Response.json({
        period,
        goalType,
        macroGoals,
        data: monthlyData,
      });
    }

    return Response.json({ period, goalType, macroGoals, data: dailyData });
  } catch (error) {
    console.error("Error in GET /health-data/deficit:", error);
    return internalError();
  }
}

interface DayEntry {
  date: string;
  caloriesBurned: number;
  caloriesConsumed: number;
  caloriesFromMacros: number;
  deficit: number;
  activeCalories: number;
  steps: number;
  protein: number;
  carbs: number;
  fat: number;
}

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function groupByWeek(data: DayEntry[]) {
  const grouped: Record<
    string,
    {
      burned: number;
      consumed: number;
      steps: number;
      count: number;
      startDate: string;
      endDate: string;
      protein: number;
      carbs: number;
      fat: number;
    }
  > = {};

  for (const d of data) {
    const week = getISOWeek(d.date);
    if (!grouped[week]) {
      grouped[week] = {
        burned: 0,
        consumed: 0,
        steps: 0,
        count: 0,
        startDate: d.date,
        endDate: d.date,
        protein: 0,
        carbs: 0,
        fat: 0,
      };
    }
    grouped[week].burned += d.caloriesBurned;
    grouped[week].consumed += d.caloriesConsumed;
    grouped[week].steps += d.steps;
    grouped[week].count += 1;
    grouped[week].protein += d.protein;
    grouped[week].carbs += d.carbs;
    grouped[week].fat += d.fat;
    if (d.date < grouped[week].startDate) grouped[week].startDate = d.date;
    if (d.date > grouped[week].endDate) grouped[week].endDate = d.date;
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, val]) => ({
      label: week,
      startDate: val.startDate,
      endDate: val.endDate,
      caloriesBurned: val.burned,
      caloriesConsumed: val.consumed,
      deficit: val.burned - val.consumed,
      avgDailyDeficit:
        val.count > 0 ? Math.round((val.burned - val.consumed) / val.count) : 0,
      totalSteps: val.steps,
      days: val.count,
      protein: Math.round(val.protein / (val.count || 1)),
      carbs: Math.round(val.carbs / (val.count || 1)),
      fat: Math.round(val.fat / (val.count || 1)),
    }));
}

function groupByMonth(data: DayEntry[]) {
  const grouped: Record<
    string,
    {
      burned: number;
      consumed: number;
      steps: number;
      count: number;
      protein: number;
      carbs: number;
      fat: number;
    }
  > = {};

  for (const d of data) {
    const month = d.date.slice(0, 7); // YYYY-MM
    if (!grouped[month]) {
      grouped[month] = {
        burned: 0,
        consumed: 0,
        steps: 0,
        count: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      };
    }
    grouped[month].burned += d.caloriesBurned;
    grouped[month].consumed += d.caloriesConsumed;
    grouped[month].steps += d.steps;
    grouped[month].count += 1;
    grouped[month].protein += d.protein;
    grouped[month].carbs += d.carbs;
    grouped[month].fat += d.fat;
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, val]) => ({
      label: month,
      caloriesBurned: val.burned,
      caloriesConsumed: val.consumed,
      deficit: val.burned - val.consumed,
      avgDailyDeficit:
        val.count > 0 ? Math.round((val.burned - val.consumed) / val.count) : 0,
      totalSteps: val.steps,
      days: val.count,
      protein: Math.round(val.protein / (val.count || 1)),
      carbs: Math.round(val.carbs / (val.count || 1)),
      fat: Math.round(val.fat / (val.count || 1)),
    }));
}
