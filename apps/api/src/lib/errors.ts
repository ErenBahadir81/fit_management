import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ErrorCode } from "@fitfloow/core";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static notFound(what = "Kayıt"): AppError {
    return new AppError(404, "NOT_FOUND", `${what} bulunamadı`);
  }
  static forbidden(message = "Bu işlem için yetkin yok"): AppError {
    return new AppError(403, "FORBIDDEN", message);
  }
  static validation(message: string, details?: unknown): AppError {
    return new AppError(400, "VALIDATION", message, details);
  }
  static conflict(message: string, code: ErrorCode = "CONFLICT"): AppError {
    return new AppError(409, code, message);
  }
}

export function errorHandler(err: FastifyError | AppError | ZodError | Error, req: FastifyRequest, reply: FastifyReply): void {
  if (err instanceof AppError) {
    reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    reply.status(400).send({ error: { code: "VALIDATION", message: "Geçersiz istek", details: err.issues } });
    return;
  }
  const fe = err as FastifyError & { validation?: unknown; issues?: unknown };
  if (fe.code === "FST_ERR_VALIDATION" || fe.validation || fe.issues) {
    reply.status(400).send({ error: { code: "VALIDATION", message: "Geçersiz istek", details: fe.validation ?? fe.issues ?? fe.message } });
    return;
  }
  if (fe.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" || fe.code === "FST_JWT_NO_AUTHORIZATION_IN_COOKIE") {
    reply.status(401).send({ error: { code: "AUTH_REQUIRED", message: "Giriş gerekli" } });
    return;
  }
  if (fe.code === "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED") {
    reply.status(401).send({ error: { code: "TOKEN_EXPIRED", message: "Oturum süresi doldu" } });
    return;
  }
  if (typeof fe.code === "string" && fe.code.startsWith("FST_JWT")) {
    reply.status(401).send({ error: { code: "AUTH_INVALID", message: "Geçersiz oturum" } });
    return;
  }
  if (fe.statusCode === 429) {
    reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Çok fazla istek, biraz bekle" } });
    return;
  }
  if (fe.statusCode === 413 || fe.code === "FST_REQ_FILE_TOO_LARGE") {
    reply.status(413).send({ error: { code: "VALIDATION", message: "Dosya çok büyük" } });
    return;
  }
  if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
    reply.status(fe.statusCode).send({ error: { code: "VALIDATION", message: fe.message } });
    return;
  }
  req.log.error({ err }, "unhandled error");
  reply.status(500).send({ error: { code: "INTERNAL", message: "Beklenmeyen bir hata oluştu" } });
}
