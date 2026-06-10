import { Router } from "express";
import { z } from "zod";
import {
  deleteUserService,
  getUserByIdService,
  listUsersService,
  resetUserPasswordService,
  saveUserService,
} from "../services/configuracion/usersService.js";
import {
  resolveRequestTenantScope,
  sanitizeModulePayload,
} from "../domain/gtTenantPolicy.js";

const router = Router();

const saveSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().optional(),
  userName: z.string().min(1),
  email: z.string().optional().nullable(),
  displayName: z.string().min(1),
  isActive: z.boolean().optional(),
});

router.get("/users", async (req, res) => {
  try {
    const includeInactive = ["1", "true", "yes", "on"].includes(
      String(req.query.include_inactive || "").trim().toLowerCase(),
    );
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);

    const rows = await listUsersService({ tenantId, includeInactive });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to list users",
      detail: error.message,
    });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);
    const row = await getUserByIdService({ id: req.params.id, tenantId });
    if (!row) return res.status(404).json({ ok: false, error: "User not found" });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to get user",
      detail: error.message,
    });
  }
});

router.post("/users", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid user payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const id = await saveUserService(sanitizeModulePayload("CONFIGURACION", parsed.data));
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to save user",
      detail: error.message,
    });
  }
});

router.put("/users/:id", async (req, res) => {
  const parsed = saveSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid user payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const id = await saveUserService(sanitizeModulePayload("CONFIGURACION", parsed.data));
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to update user",
      detail: error.message,
    });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);
    const affected = await deleteUserService({ id: req.params.id, tenantId });
    return res.json({ ok: true, affected });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to deactivate user",
      detail: error.message,
    });
  }
});

router.post("/users/:id/reset-password", async (req, res) => {
  try {
    const tenantId = resolveRequestTenantScope(
      "CONFIGURACION",
      req.body?.tenantId || req.query.tenant_id,
    );
    const affected = await resetUserPasswordService({ id: req.params.id, tenantId });
    return res.json({ ok: true, affected });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to reset password",
      detail: error.message,
    });
  }
});

export default router;
