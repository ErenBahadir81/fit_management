import mongoose, { Schema, model, type Model, type Types } from "mongoose";

export interface RefreshTokenDoc {
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  device: string | null;
}

export interface UserDoc {
  _id: Types.ObjectId;
  username: string;
  displayName: string;
  passwordHash: string;
  role: "admin" | "user";
  gender: "male" | "female";
  heightCm: number | null;
  birthDate: string | null;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "veryActive";
  measurementDay: number;
  mascotEnabled: boolean;
  unitSystem: "metric";
  refreshTokens: RefreshTokenDoc[];
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const RefreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    tokenHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    device: { type: String, default: null },
  },
  { _id: false }
);

const UserSchema = new Schema<UserDoc>(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    gender: { type: String, enum: ["male", "female"], default: "male" },
    heightCm: { type: Number, default: null },
    birthDate: { type: String, default: null },
    activityLevel: {
      type: String,
      enum: ["sedentary", "light", "moderate", "active", "veryActive"],
      default: "moderate",
    },
    measurementDay: { type: Number, min: 0, max: 6, default: 0 },
    mascotEnabled: { type: Boolean, default: true },
    unitSystem: { type: String, enum: ["metric"], default: "metric" },
    refreshTokens: { type: [RefreshTokenSchema], default: [] },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

UserSchema.index({ "refreshTokens.tokenHash": 1 });
UserSchema.index({ lastSeenAt: -1 });

export const User: Model<UserDoc> = (mongoose.models.User as Model<UserDoc>) || model<UserDoc>("User", UserSchema);

export function toUserDTO(u: UserDoc) {
  return {
    id: String(u._id),
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    gender: u.gender,
    heightCm: u.heightCm ?? null,
    birthDate: u.birthDate ?? null,
    activityLevel: u.activityLevel ?? "moderate",
    measurementDay: u.measurementDay ?? 0,
    mascotEnabled: u.mascotEnabled ?? true,
    createdAt: (u.createdAt ?? new Date()).toISOString(),
    lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
  };
}
