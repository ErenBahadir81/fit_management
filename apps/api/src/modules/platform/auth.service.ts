import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { HydratedDocument } from "mongoose";
import { User, toUserDTO, type UserDoc } from "../../models/user";
import { AppError } from "../../lib/errors";
import type { AppConfig } from "../../config";
import { isDuplicateKeyError } from "./users.service";

const DAY_MS = 86_400_000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function issueRefreshToken(user: HydratedDocument<UserDoc>, config: AppConfig, device: string | null = null): Promise<string> {
  const token = randomBytes(48).toString("hex");
  const now = Date.now();
  // prune expired + cap at 10 devices
  user.refreshTokens = (user.refreshTokens ?? []).filter((t) => t.expiresAt.getTime() > now).slice(-9);
  user.refreshTokens.push({
    tokenHash: hashToken(token),
    createdAt: new Date(now),
    expiresAt: new Date(now + config.REFRESH_TTL_DAYS * DAY_MS),
    device,
  });
  await user.save();
  return token;
}

/**
 * C3 — self-service sign-up. The username uniqueness check races the unique index, so the
 * duplicate-key error is caught and turned into the same clean Turkish 409; the client should
 * never see a Mongo error. New accounts start with `onboardingCompleted: false`.
 */
export async function register(
  app: FastifyInstance,
  config: AppConfig,
  input: { username: string; password: string; displayName: string; email?: string | null },
  device: string | null
) {
  const username = input.username.toLowerCase();
  if (await User.exists({ username })) throw AppError.conflict("Bu kullanıcı adı alınmış");

  let user: HydratedDocument<UserDoc>;
  try {
    user = await User.create({
      username,
      displayName: input.displayName.trim(),
      email: input.email ?? null,
      passwordHash: await hashPassword(input.password),
      role: "user",
      onboardingCompleted: false,
      lastSeenAt: new Date(),
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) throw AppError.conflict("Bu kullanıcı adı alınmış");
    throw e;
  }

  const refreshToken = await issueRefreshToken(user, config, device);
  const accessToken = app.signAccessToken({ id: String(user._id), role: user.role });
  return { accessToken, refreshToken, user: toUserDTO(user) };
}

export async function login(app: FastifyInstance, config: AppConfig, username: string, password: string, device: string | null) {
  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user) throw new AppError(401, "AUTH_INVALID", "Kullanıcı adı veya şifre hatalı");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new AppError(401, "AUTH_INVALID", "Kullanıcı adı veya şifre hatalı");
  user.lastSeenAt = new Date();
  const refreshToken = await issueRefreshToken(user, config, device);
  const accessToken = app.signAccessToken({ id: String(user._id), role: user.role });
  return { accessToken, refreshToken, user: toUserDTO(user) };
}

export async function rotateRefreshToken(app: FastifyInstance, config: AppConfig, refreshToken: string) {
  const h = hashToken(refreshToken);
  const user = await User.findOne({ "refreshTokens.tokenHash": h });
  if (!user) throw new AppError(401, "AUTH_INVALID", "Geçersiz oturum");
  const entry = user.refreshTokens.find((t) => t.tokenHash === h);
  if (!entry || entry.expiresAt.getTime() < Date.now()) {
    user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== h);
    await user.save();
    throw new AppError(401, "TOKEN_EXPIRED", "Oturum süresi doldu");
  }
  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== h);
  user.lastSeenAt = new Date();
  const next = await issueRefreshToken(user, config, entry.device);
  const accessToken = app.signAccessToken({ id: String(user._id), role: user.role });
  return { accessToken, refreshToken: next };
}

export async function revokeRefreshToken(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const h = hashToken(refreshToken);
  await User.updateOne({ "refreshTokens.tokenHash": h }, { $pull: { refreshTokens: { tokenHash: h } } });
}
