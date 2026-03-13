import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  clerkId: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  preferences: {
    weightUnit: string;
    distanceUnit: string;
  };
  profile: {
    heightCm?: number | null;
    weightKg?: number | null;
    age?: number | null;
    gender?: string | null;
    goalType?: string | null; // e.g. "cut", "bulk", "maintain"
    targetWeightKg?: number | null;
    weeklyWeightChange?: number | null; // kg/week – negative = lose, positive = gain (e.g. -0.5)
    dailyCalorieGoal?: number | null;
    dailyProteinGoal?: number | null;
  };
  connectedApps: {
    appleHealth: { connected: boolean; lastSyncAt?: Date | null };
    myFitnessPal: { connected: boolean; lastSyncAt?: Date | null };
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    avatarUrl: { type: String, default: null },
    preferences: {
      weightUnit: { type: String, default: "kg" },
      distanceUnit: { type: String, default: "km" },
    },
    profile: {
      heightCm: { type: Number, default: null },
      weightKg: { type: Number, default: null },
      age: { type: Number, default: null },
      gender: { type: String, default: null },
      goalType: { type: String, default: null },
      targetWeightKg: { type: Number, default: null },
      weeklyWeightChange: { type: Number, default: null },
      dailyCalorieGoal: { type: Number, default: null },
      dailyProteinGoal: { type: Number, default: null },
    },
    connectedApps: {
      appleHealth: {
        connected: { type: Boolean, default: false },
        lastSyncAt: { type: Date, default: null },
      },
      myFitnessPal: {
        connected: { type: Boolean, default: false },
        lastSyncAt: { type: Date, default: null },
      },
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
