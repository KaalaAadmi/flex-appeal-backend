import mongoose, { Schema, Document, Model } from "mongoose";

export interface IExercise extends Document {
  name: string;
  equipment: string;
  category: string;
  musclesWorked: string[];
  isCustom: boolean;
  userId?: string | null; // null = global/system exercise, string = custom user exercise
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseSchema = new Schema<IExercise>(
  {
    name: { type: String, required: true },
    equipment: { type: String, required: true },
    category: { type: String, required: true },
    musclesWorked: [{ type: String }],
    isCustom: { type: Boolean, default: false },
    userId: { type: String, default: null, index: true },
  },
  {
    timestamps: true,
  },
);

// Text index for full-text search
ExerciseSchema.index({ name: "text" });

export const Exercise: Model<IExercise> =
  mongoose.models.Exercise ||
  mongoose.model<IExercise>("Exercise", ExerciseSchema);
