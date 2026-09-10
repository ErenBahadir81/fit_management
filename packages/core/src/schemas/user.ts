import { z } from "zod";
import { zActivityLevel, zDateKey, zGender, zId, zIso, zRole, zWeekday } from "./common";

export const zUser = z.object({
  id: zId,
  username: z.string(),
  displayName: z.string(),
  role: zRole,
  gender: zGender,
  heightCm: z.number().nullable(),
  birthDate: zDateKey.nullable(),
  activityLevel: zActivityLevel,
  measurementDay: zWeekday,
  mascotEnabled: z.boolean(),
  createdAt: zIso,
  lastSeenAt: zIso.nullable().optional(),
});
export type UserDTO = z.infer<typeof zUser>;

export const zUsername = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_.]+$/i, "Kullanıcı adı harf, rakam, nokta ve alt çizgi içerebilir")
  .transform((s) => s.toLowerCase());
export const zPassword = z.string().min(6).max(128);

export const zLoginInput = z.object({ username: zUsername, password: z.string().min(1) });
export type LoginInput = z.infer<typeof zLoginInput>;

export const zAuthTokens = z.object({ accessToken: z.string(), refreshToken: z.string() });
export type AuthTokens = z.infer<typeof zAuthTokens>;
export const zLoginResponse = zAuthTokens.extend({ user: zUser });
export type LoginResponse = z.infer<typeof zLoginResponse>;

export const zUpdateMeInput = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    gender: zGender,
    heightCm: z.number().min(100).max(250).nullable(),
    birthDate: zDateKey.nullable(),
    activityLevel: zActivityLevel,
    measurementDay: zWeekday,
    mascotEnabled: z.boolean(),
  })
  .partial();
export type UpdateMeInput = z.infer<typeof zUpdateMeInput>;

export const zChangePasswordInput = z.object({ currentPassword: z.string().min(1), newPassword: zPassword });

/* admin */
export const zAdminCreateUserInput = z.object({
  username: zUsername,
  displayName: z.string().trim().min(1).max(60),
  password: zPassword,
  role: zRole.default("user"),
  gender: zGender.default("male"),
  heightCm: z.number().min(100).max(250).nullable().optional(),
  birthDate: zDateKey.nullable().optional(),
  activityLevel: zActivityLevel.default("moderate"),
  measurementDay: zWeekday.default(0),
});
export type AdminCreateUserInput = z.infer<typeof zAdminCreateUserInput>;

export const zAdminUpdateUserInput = zAdminCreateUserInput.partial();
export type AdminUpdateUserInput = z.infer<typeof zAdminUpdateUserInput>;

export const zAdminUser = zUser.extend({
  hasProgram: z.boolean().optional(),
  goalStatus: z.enum(["active", "completed", "abandoned"]).nullable().optional(),
});
export type AdminUserDTO = z.infer<typeof zAdminUser>;
