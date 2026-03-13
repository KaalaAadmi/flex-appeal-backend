import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Exercise, IExercise } from "@/models/Exercise";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { badRequest, internalError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    // Auth is optional for GET — unauthenticated users see global exercises only
    const auth = await authenticateRequest(req);

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const equipment = searchParams.get("equipment");
    const search = searchParams.get("search");

    await connectDB();

    // If authenticated, show global + user's custom exercises
    // If not authenticated, show only global exercises
    const filter: Record<string, unknown> = auth
      ? { $or: [{ userId: null }, { userId: auth.clerkId }] }
      : { userId: null };

    if (category) {
      filter.category = category;
    }
    if (equipment) {
      filter.equipment = equipment;
    }
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const exercises = await Exercise.find(filter)
      .sort({ name: 1 })
      .lean<IExercise[]>();

    return Response.json({
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
    console.error("Error in GET /exercises:", error);
    return internalError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return unauthorizedResponse();

    const body = await req.json();
    const { name, equipment, category, musclesWorked } = body;

    if (!name || !equipment || !category) {
      return badRequest("Missing required fields: name, equipment, category");
    }

    await connectDB();

    const exercise = await Exercise.create({
      name,
      equipment,
      category,
      musclesWorked: musclesWorked || [],
      userId: auth.clerkId,
      isCustom: true,
    });

    return Response.json(
      {
        id: exercise._id,
        name: exercise.name,
        equipment: exercise.equipment,
        category: exercise.category,
        musclesWorked: exercise.musclesWorked,
        isCustom: exercise.isCustom,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in POST /exercises:", error);
    return internalError();
  }
}
