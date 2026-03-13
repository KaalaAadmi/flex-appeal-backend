import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Exercise, IExercise } from "@/models/Exercise";
import { badRequest, internalError, errorResponse } from "@/lib/errors";

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
 * POST /api/v1/admin/exercises
 *
 * Add a single global exercise (admin only).
 * Body: { name, equipment, category, musclesWorked? }
 */
export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) {
    return errorResponse("FORBIDDEN", "Invalid or missing admin API key", 403);
  }

  try {
    const body = await req.json();
    const { name, equipment, category, musclesWorked } = body;

    if (!name || !equipment || !category) {
      return badRequest("Missing required fields: name, equipment, category");
    }

    await connectDB();

    // Check for duplicate global exercise (same name + equipment)
    const existing = await Exercise.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      equipment: { $regex: new RegExp(`^${equipment}$`, "i") },
      userId: null,
    });

    if (existing) {
      return errorResponse(
        "CONFLICT",
        `Exercise "${name}" with equipment "${equipment}" already exists`,
        409,
      );
    }

    const exercise = await Exercise.create({
      name,
      equipment,
      category,
      musclesWorked: musclesWorked || [],
      isCustom: false,
      userId: null,
    });

    return Response.json(
      {
        exercise: {
          id: exercise._id,
          name: exercise.name,
          equipment: exercise.equipment,
          category: exercise.category,
          musclesWorked: exercise.musclesWorked,
          isCustom: exercise.isCustom,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in POST /admin/exercises:", error);
    return internalError();
  }
}

/**
 * GET /api/v1/admin/exercises
 *
 * List all global exercises with count (admin only).
 */
export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) {
    return errorResponse("FORBIDDEN", "Invalid or missing admin API key", 403);
  }

  try {
    await connectDB();

    const exercises = await Exercise.find({ userId: null })
      .sort({ category: 1, name: 1 })
      .lean<IExercise[]>();

    return Response.json({
      total: exercises.length,
      exercises: exercises.map((ex) => ({
        id: ex._id,
        name: ex.name,
        equipment: ex.equipment,
        category: ex.category,
        musclesWorked: ex.musclesWorked,
        isCustom: ex.isCustom,
      })),
    });
  } catch (error) {
    console.error("Error in GET /admin/exercises:", error);
    return internalError();
  }
}
