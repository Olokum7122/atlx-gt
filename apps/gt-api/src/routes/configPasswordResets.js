import { Router } from "express";
import { z } from "zod";
import {
  createSecurityPasswordResetService,
  listSecurityPasswordResetsService,
  revokeSecurityPasswordResetService,
} from "../services/configuracion/securityPasswordResetsService.js";
import {
  resolveRequestTenantScope,
  sanitizeModulePayload,
} from "../domain/gtTenantPolicy.js";

const router = Router();

const createSchema = z.object({
  tenantId: z.string().optional(),
  userName: z.string().min(1),
  email: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  sendEmail: z.boolean().optional(),
});

router.get("/security/password-resets", async (req, res) => {
  try {
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);
    const rows = await listSecurityPasswordResetsService({ tenantId });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: "Failed to list password resets", detail: error.message });
  }
});

router.post("/security/password-resets", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid password reset payload", issues: parsed.error.issues });
  }

  try {
    const id = await createSecurityPasswordResetService(
      sanitizeModulePayload("CONFIGURACION", parsed.data),
    );
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: "Failed to create password reset", detail: error.message });
  }
});

router.post("/security/password-resets/:id/revoke", async (req, res) => {
  try {
    const tenantId = resolveRequestTenantScope(
      "CONFIGURACION",
      req.body?.tenantId || req.query.tenant_id,
    );
    const affected = await revokeSecurityPasswordResetService({ tenantId, id: req.params.id });
    return res.json({ ok: true, affected });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: "Failed to revoke password reset", detail: error.message });
  }
});

export default router;
