import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zLoginInput, zUpdateMeInput, zChangePasswordInput } from "@fitfloow/core";
import bcrypt from "bcryptjs";
import { User, toUserDTO } from "../../models/user";
import { AppError } from "../../lib/errors";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../../lib/auth";
import type { AppConfig } from "../../config";
import { hashPassword, login, revokeRefreshToken, rotateRefreshToken } from "./auth.service";

const zRefreshBody = z.object({ refreshToken: z.string().optional() }).default({});

export async function authRoutes(app: FastifyInstance, opts: { config: AppConfig }) {
  const { config } = opts;
  const cookieOpts = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.COOKIE_SECURE,
  };

  app.post(
    "/auth/login",
    {
      schema: { body: zLoginInput, querystring: z.object({ cookie: z.string().optional() }) },
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { username, password } = req.body as z.infer<typeof zLoginInput>;
      const device = (req.headers["user-agent"] ?? "").slice(0, 120) || null;
      const result = await login(app, config, username, password, device);
      const q = req.query as { cookie?: string };
      if (q.cookie === "1") {
        reply.setCookie(ACCESS_COOKIE, result.accessToken, { ...cookieOpts, maxAge: config.ACCESS_TTL_MIN * 60 });
        reply.setCookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOpts, maxAge: config.REFRESH_TTL_DAYS * 86400, path: "/api/v1/auth" });
      }
      return result;
    }
  );

  app.post("/auth/refresh", { schema: { body: zRefreshBody } }, async (req, reply) => {
    const body = req.body as z.infer<typeof zRefreshBody>;
    const fromCookie = req.cookies?.[REFRESH_COOKIE];
    const token = body.refreshToken ?? fromCookie;
    if (!token) throw new AppError(401, "AUTH_REQUIRED", "Yenileme jetonu yok");
    const tokens = await rotateRefreshToken(app, config, token);
    if (fromCookie && !body.refreshToken) {
      reply.setCookie(ACCESS_COOKIE, tokens.accessToken, { ...cookieOpts, maxAge: config.ACCESS_TTL_MIN * 60 });
      reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, { ...cookieOpts, maxAge: config.REFRESH_TTL_DAYS * 86400, path: "/api/v1/auth" });
    }
    return tokens;
  });

  app.post("/auth/logout", { schema: { body: zRefreshBody } }, async (req, reply) => {
    const body = req.body as z.infer<typeof zRefreshBody>;
    await revokeRefreshToken(body.refreshToken ?? req.cookies?.[REFRESH_COOKIE]);
    reply.clearCookie(ACCESS_COOKIE, { path: "/" });
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
    return reply.status(204).send();
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    const user = await User.findById(req.auth.id);
    if (!user) throw new AppError(401, "AUTH_INVALID", "Kullanıcı bulunamadı");
    return { user: toUserDTO(user) };
  });

  app.patch("/me", { preHandler: [app.authenticate], schema: { body: zUpdateMeInput } }, async (req) => {
    const input = req.body as z.infer<typeof zUpdateMeInput>;
    const user = await User.findByIdAndUpdate(req.auth.id, { $set: input }, { returnDocument: "after" });
    if (!user) throw AppError.notFound("Kullanıcı");
    return { user: toUserDTO(user) };
  });

  app.patch("/me/password", { preHandler: [app.authenticate], schema: { body: zChangePasswordInput } }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof zChangePasswordInput>;
    const user = await User.findById(req.auth.id);
    if (!user) throw AppError.notFound("Kullanıcı");
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new AppError(400, "AUTH_INVALID", "Mevcut şifre hatalı");
    user.passwordHash = await hashPassword(newPassword);
    user.refreshTokens = [];
    await user.save();
    return reply.status(204).send();
  });
}
