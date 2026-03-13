import mongoose, { Schema, Document, Model } from "mongoose";

export interface IHealthData extends Document {
  userId: string; // clerkId
  date: Date; // the calendar day this entry is for
  source: "apple_health" | "myfitnesspal" | "manual";

  // Calorie data
  caloriesBurned?: number | null; // from Apple Health (active + basal)
  activeCaloriesBurned?: number | null; // from Apple Health (active only)
  basalCaloriesBurned?: number | null; // from Apple Health (resting)
  caloriesConsumed?: number | null; // from MyFitnessPal

  // Macros (from MyFitnessPal)
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;

  // Activity data (from Apple Health)
  stepCount?: number | null;
  distanceKm?: number | null;
  activeMinutes?: number | null;

  // Body measurements (from Apple Health)
  bodyWeightKg?: number | null;

  createdAt: Date;
  updatedAt: Date;
}

const HealthDataSchema = new Schema<IHealthData>(
  {
    userId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    source: {
      type: String,
      required: true,
      enum: ["apple_health", "myfitnesspal", "manual"],
    },

    // Calorie data
    caloriesBurned: { type: Number, default: null },
    activeCaloriesBurned: { type: Number, default: null },
    basalCaloriesBurned: { type: Number, default: null },
    caloriesConsumed: { type: Number, default: null },

    // Macros
    proteinGrams: { type: Number, default: null },
    carbsGrams: { type: Number, default: null },
    fatGrams: { type: Number, default: null },

    // Activity
    stepCount: { type: Number, default: null },
    distanceKm: { type: Number, default: null },
    activeMinutes: { type: Number, default: null },

    // Body
    bodyWeightKg: { type: Number, default: null },
  },
  {
    timestamps: true,
  },
);

// Compound index: one entry per user + date + source
HealthDataSchema.index({ userId: 1, date: -1, source: 1 }, { unique: true });

export const HealthData: Model<IHealthData> =
  mongoose.models.HealthData ||
  mongoose.model<IHealthData>("HealthData", HealthDataSchema);
