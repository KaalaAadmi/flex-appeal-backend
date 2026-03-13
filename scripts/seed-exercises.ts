/**
 * Seed script to populate the database with exercises.
 * Run with: npx tsx scripts/seed-exercises.ts
 */
import mongoose from "mongoose";
import { SEED_EXERCISES } from "../src/data/exercises-seed";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://KaalaAadmi:KaalaAadmi@cluster0.jklca.mongodb.net/flex-appeal";

async function seed() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected!");

  const ExerciseSchema = new mongoose.Schema(
    {
      name: { type: String, required: true },
      equipment: { type: String, required: true },
      category: { type: String, required: true },
      musclesWorked: [{ type: String }],
      isCustom: { type: Boolean, default: false },
      userId: { type: String, default: null, index: true },
    },
    { timestamps: true },
  );

  const Exercise =
    mongoose.models.Exercise || mongoose.model("Exercise", ExerciseSchema);

  // Get existing exercises to skip duplicates
  const existing = await Exercise.find({ userId: null }).lean();
  const existingKeys = new Set(
    existing.map(
      (e: { name: string; equipment: string }) =>
        `${e.name.toLowerCase()}::${e.equipment.toLowerCase()}`,
    ),
  );

  const toInsert = SEED_EXERCISES.filter(
    (ex) =>
      !existingKeys.has(
        `${ex.name.toLowerCase()}::${ex.equipment.toLowerCase()}`,
      ),
  );

  console.log(`Found ${existing.length} existing exercises`);
  console.log(`${SEED_EXERCISES.length} total seed exercises`);
  console.log(`${toInsert.length} new exercises to insert`);
  console.log(`${SEED_EXERCISES.length - toInsert.length} duplicates skipped`);

  if (toInsert.length > 0) {
    const docs = toInsert.map((ex) => ({
      name: ex.name,
      equipment: ex.equipment,
      category: ex.category,
      musclesWorked: ex.musclesWorked,
      isCustom: false,
      userId: null,
    }));

    const result = await Exercise.insertMany(docs);
    console.log(`✅ Inserted ${result.length} exercises!`);
  } else {
    console.log("No new exercises to insert.");
  }

  // Final count
  const total = await Exercise.countDocuments({ userId: null });
  console.log(`Total global exercises in DB: ${total}`);

  await mongoose.disconnect();
  console.log("Done!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
