import mongoose, { Schema, Document, Model } from "mongoose";

interface WorkoutSet {
  setNumber: number;
  weight: number;
  reps: number;
}

interface WorkoutExercise {
  exerciseId?: string;
  name: string;
  equipment: string;
  tags: string[];
  sets: WorkoutSet[];
}

interface WorkoutWarmup {
  type: string;
  durationMinutes: number;
  completed: boolean;
}

interface CardioSegment {
  durationMinutes: number;
  speed: string;
  incline: string;
  completed: boolean;
}

interface WorkoutCardio {
  type: string;
  segments: CardioSegment[];
}

interface WorkoutStats {
  duration: string;
  workingSets: number;
  totalWeight: number;
  estCalories: number;
  prs: number;
}

export interface IWorkout extends Document {
  userId: string;
  title: string;
  type: string;
  date: Date;
  description?: string;
  exerciseNames: string[];
  exercises: WorkoutExercise[];
  warmup?: WorkoutWarmup | null;
  cardio?: WorkoutCardio | null;
  durationSeconds: number;
  routineId?: string | null;
  stats: WorkoutStats;
  createdAt: Date;
  updatedAt: Date;
}

const WorkoutSetSchema = new Schema(
  {
    setNumber: { type: Number, required: true },
    weight: { type: Number, required: true },
    reps: { type: Number, required: true },
  },
  { _id: false },
);

const WorkoutExerciseSchema = new Schema(
  {
    exerciseId: { type: String, default: null },
    name: { type: String, required: true },
    equipment: { type: String, default: "" },
    tags: [{ type: String }],
    sets: [WorkoutSetSchema],
  },
  { _id: false },
);

const WorkoutWarmupSchema = new Schema(
  {
    type: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    completed: { type: Boolean, default: false },
  },
  { _id: false },
);

const CardioSegmentSchema = new Schema(
  {
    durationMinutes: { type: Number, required: true },
    speed: { type: String, default: "0" },
    incline: { type: String, default: "0" },
    completed: { type: Boolean, default: false },
  },
  { _id: false },
);

const WorkoutCardioSchema = new Schema(
  {
    type: { type: String, required: true },
    segments: [CardioSegmentSchema],
  },
  { _id: false },
);

const WorkoutStatsSchema = new Schema(
  {
    duration: { type: String, default: "0m" },
    workingSets: { type: Number, default: 0 },
    totalWeight: { type: Number, default: 0 },
    estCalories: { type: Number, default: 0 },
    prs: { type: Number, default: 0 },
  },
  { _id: false },
);

const WorkoutSchema = new Schema<IWorkout>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    type: { type: String, required: true },
    date: { type: Date, required: true },
    description: { type: String, default: "" },
    exerciseNames: [{ type: String }],
    exercises: [WorkoutExerciseSchema],
    warmup: { type: WorkoutWarmupSchema, default: null },
    cardio: { type: WorkoutCardioSchema, default: null },
    durationSeconds: { type: Number, default: 0 },
    routineId: { type: String, default: null },
    stats: { type: WorkoutStatsSchema, default: {} },
  },
  {
    timestamps: true,
  },
);

// Index for listing workouts by user, sorted by date
WorkoutSchema.index({ userId: 1, date: -1 });

export const Workout: Model<IWorkout> =
  mongoose.models.Workout || mongoose.model<IWorkout>("Workout", WorkoutSchema);
