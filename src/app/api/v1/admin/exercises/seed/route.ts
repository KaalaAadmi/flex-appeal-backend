import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Exercise, IExercise } from "@/models/Exercise";
import { badRequest, internalError, errorResponse } from "@/lib/errors";

interface SeedExerciseInput {
  name: string;
  equipment: string;
  category: string;
  musclesWorked?: string[];
}

/**
 * Verify admin API key from the x-admin-key header.
 */
function verifyAdminKey(req: NextRequest): boolean {
  const key = req.headers.get("x-admin-key");
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || !key) return false;
  return key === adminKey;
}

/**
 * POST /api/v1/admin/exercises/seed
 *
 * Bulk-seed global exercises (admin only).
 * Body: { exercises: [{ name, equipment, category, musclesWorked? }] }
 *
 * Skips exercises that already exist (same name + equipment, case-insensitive).
 */
export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) {
    return errorResponse("FORBIDDEN", "Invalid or missing admin API key", 403);
  }

  try {
    const body = await req.json();
    const { exercises } = body;

    if (!exercises || !Array.isArray(exercises) || exercises.length === 0) {
      return badRequest("Body must include a non-empty 'exercises' array");
    }

    // Validate all entries
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      if (!ex.name || !ex.equipment || !ex.category) {
        return badRequest(
          `Exercise at index ${i} is missing required fields (name, equipment, category)`,
        );
      }
    }

    await connectDB();

    // Fetch existing global exercises to detect duplicates
    const existing = await Exercise.find({ userId: null })
      .select("name equipment")
      .lean<Pick<IExercise, "name" | "equipment">[]>();

    const existingSet = new Set(
      existing.map(
        (e) => `${e.name.toLowerCase()}::${e.equipment.toLowerCase()}`,
      ),
    );

    const toInsert = exercises.filter(
      (ex: SeedExerciseInput) =>
        !existingSet.has(
          `${ex.name.toLowerCase()}::${ex.equipment.toLowerCase()}`,
        ),
    );

    let inserted = 0;
    if (toInsert.length > 0) {
      const docs = toInsert.map((ex: SeedExerciseInput) => ({
        name: ex.name,
        equipment: ex.equipment,
        category: ex.category,
        musclesWorked: ex.musclesWorked || [],
        isCustom: false,
        userId: null,
      }));

      const result = await Exercise.insertMany(docs, { ordered: false });
      inserted = result.length;
    }

    return Response.json({
      message: `Seeded ${inserted} new exercises. ${exercises.length - toInsert.length} already existed.`,
      inserted,
      skipped: exercises.length - toInsert.length,
      total: exercises.length,
    });
  } catch (error) {
    console.error("Error in POST /admin/exercises/seed:", error);
    return internalError();
  }
}
