import { Router } from "express";
import { z } from "zod";
import {
  getSecurityControlOverviewService,
  revokeSecuritySessionService,
} from "../services/configuracion/securityControlService.js";
import {
  resolveRequestTenantScope,
  sanitizeModulePayload,
} from "../domain/gtTenantPolicy.js";

const router = Router();

const revokeSchema = z.object({
  revokeReason: z.string().optional(),
  tenantId: z.string().optional(),
});

router.get("/security/control-login", async (req, res) => {
  try {
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);
    const result = await getSecurityControlOverviewService({ tenantId });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: "Failed to load security control overview", detail: error.message });
  }
});

router.post("/security/control-login/sessions/:id/revoke", async (req, res) => {
  const parsed = revokeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid revoke payload", issues: parsed.error.issues });
  }

  try {
    const payload = sanitizeModulePayload("CONFIGURACION", {
      ...parsed.data,
      tenantId: parsed.data.tenantId || req.query.tenant_id,
    });
    const affected = await revokeSecuritySessionService({
      tenantId: payload.tenantId,
      sessionId: req.params.id,
      revokeReason: payload.revokeReason,
    });
    return res.json({ ok: true, affected });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: "Failed to revoke security session", detail: error.message });
  }
});

export default router;
