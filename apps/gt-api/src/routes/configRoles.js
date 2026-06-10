import { Router } from "express";
import { z } from "zod";
import {
  deleteRoleService,
  getRoleByIdService,
  listPermissionCatalogService,
  listRolesService,
  saveRoleService,
} from "../services/configuracion/rolesService.js";
import {
  resolveRequestTenantScope,
  sanitizeModulePayload,
} from "../domain/gtTenantPolicy.js";

const router = Router();

const saveSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().optional(),
  roleCode: z.string().min(1),
  roleName: z.string().min(1),
  permissions: z.array(z.string()).default([]),
  isActive: z.boolean().optional(),
});

router.get("/roles", async (req, res) => {
  try {
    const includeInactive = ["1", "true", "yes", "on"].includes(
      String(req.query.include_inactive || "").trim().toLowerCase(),
    );
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);

    const rows = await listRolesService({ tenantId, includeInactive });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to list roles",
      detail: error.message,
    });
  }
});

router.get("/roles/permission-catalog", async (req, res) => {
  try {
    const includeInactive = ["1", "true", "yes", "on"].includes(
      String(req.query.include_inactive || "").trim().toLowerCase(),
    );
    const rows = await listPermissionCatalogService({ includeInactive });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list permission catalog",
      detail: error.message,
    });
  }
});

router.get("/roles/:id", async (req, res) => {
  try {
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);
    const row = await getRoleByIdService({ id: req.params.id, tenantId });
    if (!row) return res.status(404).json({ ok: false, error: "Role not found" });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to get role",
      detail: error.message,
    });
  }
});

router.post("/roles", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid role payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const id = await saveRoleService(sanitizeModulePayload("CONFIGURACION", parsed.data));
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to save role",
      detail: error.message,
    });
  }
});

router.put("/roles/:id", async (req, res) => {
  const parsed = saveSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid role payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const id = await saveRoleService(sanitizeModulePayload("CONFIGURACION", parsed.data));
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to update role",
      detail: error.message,
    });
  }
});

router.delete("/roles/:id", async (req, res) => {
  try {
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);
    const affected = await deleteRoleService({ id: req.params.id, tenantId });
    return res.json({ ok: true, affected });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to deactivate role",
      detail: error.message,
    });
  }
});

export default router;
