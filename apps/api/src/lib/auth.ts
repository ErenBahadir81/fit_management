import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import { AppError } from "./errors";
import type { AppConfig } from "../config";

export interface AuthUser {
  id: string;
  role: "admin" | "user";
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    signAccessToken: (user: AuthUser) => string;
  }
  interface FastifyRequest {
    auth: AuthUser;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: "admin" | "user" };
    user: { sub: string; role: "admin" | "user" };
  }
}

export const ACCESS_COOKIE = "fit_access";
export const REFRESH_COOKIE = "fit_refresh";

export const authPlugin = fp(async (app: FastifyInstance, opts: { config: AppConfig }) => {
  await app.register(cookie);
  await app.register(jwt, {
    secret: opts.config.JWT_SECRET,
    sign: { expiresIn: `${opts.config.ACCESS_TTL_MIN}m` },
    cookie: { cookieName: ACCESS_COOKIE, signed: false },
  });

  app.decorateRequest("auth", null as unknown as AuthUser);

  app.decorate("signAccessToken", (user: AuthUser) => app.jwt.sign({ sub: user.id, role: user.role }));

  app.decorate("authenticate", async (req: FastifyRequest) => {
    // Bearer header takes precedence; falls back to the fit_access cookie (admin web).
    const payload = await req.jwtVerify<{ sub: string; role: "admin" | "user" }>();
    req.auth = { id: payload.sub, role: payload.role };
  });

  app.decorate("requireAdmin", async (req: FastifyRequest) => {
    const payload = await req.jwtVerify<{ sub: string; role: "admin" | "user" }>();
    req.auth = { id: payload.sub, role: payload.role };
    if (payload.role !== "admin") throw AppError.forbidden();
  });
});
