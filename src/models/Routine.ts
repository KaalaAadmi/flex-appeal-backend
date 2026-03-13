import mongoose, { Schema, Document, Model } from "mongoose";

interface RoutineDayExercise {
  exerciseId: string;
  name: string;
  equipment: string;
  sets: number;
  reps: string;
}

interface RoutineDay {
  dayOfWeek: string;
  label: string;
  isRest: boolean;
  exercises: RoutineDayExercise[];
}

interface CardioSegment {
  id: string;
  durationMinutes: string;
  speed: string;
  incline: string;
}

export interface IRoutine extends Document {
  userId: string;
  name: string;
  templateId: string;
  cycleStartDay: string;
  days: RoutineDay[];
  hasWarmup: boolean;
  warmupType?: string | null;
  warmupDurationMinutes?: number | null;
  hasCardio: boolean;
  cardioType?: string | null;
  cardioSegments: CardioSegment[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoutineDayExerciseSchema = new Schema(
  {
    exerciseId: { type: String, required: true },
    name: { type: String, required: true },
    equipment: { type: String, default: "" },
    sets: { type: Number, required: true },
    reps: { type: String, required: true },
  },
  { _id: false },
);

const RoutineDaySchema = new Schema(
  {
    dayOfWeek: { type: String, required: true },
    label: { type: String, default: "" },
    isRest: { type: Boolean, default: false },
    exercises: [RoutineDayExerciseSchema],
  },
  { _id: false },
);

const CardioSegmentSchema = new Schema(
  {
    id: { type: String, required: true },
    durationMinutes: { type: String, required: true },
    speed: { type: String, default: "0" },
    incline: { type: String, default: "0" },
  },
  { _id: false },
);

const RoutineSchema = new Schema<IRoutine>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    templateId: { type: String, required: true },
    cycleStartDay: { type: String, default: "Monday" },
    days: [RoutineDaySchema],
    hasWarmup: { type: Boolean, default: false },
    warmupType: { type: String, default: null },
    warmupDurationMinutes: { type: Number, default: null },
    hasCardio: { type: Boolean, default: false },
    cardioType: { type: String, default: null },
    cardioSegments: [CardioSegmentSchema],
    active: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

export const Routine: Model<IRoutine> =
  mongoose.models.Routine || mongoose.model<IRoutine>("Routine", RoutineSchema);
