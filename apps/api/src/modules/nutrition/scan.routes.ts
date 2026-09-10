import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import type { AppContext } from "../../context";
import { runScan } from "./scan.service";
import { openScanImage } from "./uploads";

const zUploadParams = z.object({ userId: z.string().min(1), file: z.string().min(1) });

export async function scanRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = { preHandler: [app.authenticate] };

  app.post(
    "/nutrition/scan",
    { ...auth, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req) => {
      if (!req.isMultipart()) throw AppError.validation("multipart/form-data ile bir `image` alanı gönderilmeli");
      const file = await req.file();
      if (!file || file.fieldname !== "image") throw AppError.validation("`image` alanı gerekli");
      const bytes = await file.toBuffer();
      return runScan(ctx, req.auth.id, { bytes, mimetype: file.mimetype, truncated: file.file.truncated });
    }
  );

  // Scan images are private: only the owner (or an admin) may read one.
  app.get("/uploads/scans/:userId/:file", { ...auth, schema: { params: zUploadParams } }, async (req, reply) => {
    const { userId, file } = req.params as z.infer<typeof zUploadParams>;
    if (req.auth.id !== userId && req.auth.role !== "admin") throw AppError.forbidden();
    const { stream, size } = await openScanImage(ctx.config, userId, file);
    return reply.header("Content-Type", "image/jpeg").header("Content-Length", size).header("Cache-Control", "private, max-age=86400").send(stream);
  });
}
