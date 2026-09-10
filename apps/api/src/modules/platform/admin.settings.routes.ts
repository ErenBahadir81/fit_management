import type { FastifyInstance } from "fastify";
import { validateRateTable, zSettings, type SettingsDTO } from "@fitfloow/core";
import { Settings, getSettings } from "../../models/settings";
import { AppError } from "../../lib/errors";
import type { AppContext } from "../../context";

/** The settings singleton (`_id: "global"`). `getSettings()` stays the single read path. */
export async function adminSettingsRoutes(app: FastifyInstance, opts: { ctx: AppContext }) {
  const { ctx } = opts;
  const admin = { preHandler: [app.requireAdmin] };

  app.get("/admin/settings", admin, async () => getSettings());

  app.put("/admin/settings", { ...admin, schema: { body: zSettings } }, async (req) => {
    const data = req.body as SettingsDTO;
    const problems = validateRateTable(data.goal.rateTable);
    if (problems.length > 0) throw AppError.validation("Hız tablosu geçersiz", problems);
    const next: SettingsDTO = { ...data, updatedAt: ctx.now().toISOString() };
    await Settings.updateOne({ _id: "global" }, { $set: { data: next } }, { upsert: true });
    return getSettings();
  });
}
