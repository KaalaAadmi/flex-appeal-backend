import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { HealthData } from "@/models/HealthData";
import { User } from "@/models/User";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { badRequest, internalError } from "@/lib/errors";

/**
 * POST /api/v1/health-data/sync
 * Bulk upsert health data entries from Apple Health / MyFitnessPal.
 * Body: { entries: [{ date, source, caloriesBurned?, ... }] }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const body = await req.json();
    const { entries } = body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return badRequest("entries must be a non-empty array");
    }

    await connectDB();

    const ops = entries.map(
      (entry: {
        date: string;
        source: string;
        caloriesBurned?: number;
        activeCaloriesBurned?: number;
        basalCaloriesBurned?: number;
        caloriesConsumed?: number;
        proteinGrams?: number;
        carbsGrams?: number;
        fatGrams?: number;
        stepCount?: number;
        distanceKm?: number;
        activeMinutes?: number;
        bodyWeightKg?: number;
      }) => {
        const dateObj = new Date(entry.date);
        // Normalize to start of day
        dateObj.setUTCHours(0, 0, 0, 0);

        const setFields: Record<string, unknown> = {
          userId: auth.clerkId,
          date: dateObj,
          source: entry.source,
        };

        // Only set fields that are provided
        const optionalFields = [
          "caloriesBurned",
          "activeCaloriesBurned",
          "basalCaloriesBurned",
          "caloriesConsumed",
          "proteinGrams",
          "carbsGrams",
          "fatGrams",
          "stepCount",
          "distanceKm",
          "activeMinutes",
          "bodyWeightKg",
        ] as const;

        for (const field of optionalFields) {
          if (entry[field] !== undefined && entry[field] !== null) {
            setFields[field] = entry[field];
          }
        }

        return {
          updateOne: {
            filter: {
              userId: auth.clerkId,
              date: dateObj,
              source: entry.source,
            },
            update: { $set: setFields },
            upsert: true,
          },
        };
      },
    );

    const result = await HealthData.bulkWrite(ops);

    // If any entry contains bodyWeightKg, update the user's profile weight
    // with the most recent value
    const latestWeight = entries
      .filter(
        (e: { bodyWeightKg?: number; date: string }) =>
          e.bodyWeightKg !== undefined && e.bodyWeightKg !== null,
      )
      .sort(
        (a: { date: string }, b: { date: string }) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      )[0];

    if (latestWeight?.bodyWeightKg) {
      await User.findOneAndUpdate(
        { clerkId: auth.clerkId },
        { $set: { "profile.weightKg": latestWeight.bodyWeightKg } },
      );
    }

    return Response.json({
      synced: entries.length,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error in POST /health-data/sync:", error);
    return internalError();
  }
}

/**
 * GET /api/v1/health-data/sync?from=&to=&source=
 * Get health data entries for a date range.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const source = searchParams.get("source");

    await connectDB();

    const filter: Record<string, unknown> = { userId: auth.clerkId };

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setUTCHours(23, 59, 59, 999);
        dateFilter.$lte = toDate;
      }
      filter.date = dateFilter;
    }

    if (source) {
      filter.source = source;
    }

    const entries = await HealthData.find(filter).sort({ date: -1 }).lean();

    return Response.json({ entries });
  } catch (error) {
    console.error("Error in GET /health-data/sync:", error);
    return internalError();
  }
}
