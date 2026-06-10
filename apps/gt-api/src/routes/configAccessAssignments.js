import { Router } from "express";
import { z } from "zod";
import {
  deleteAccessAssignmentService,
  getAccessAssignmentByIdService,
  listAccessAssignmentsService,
  saveAccessAssignmentService,
} from "../services/configuracion/accessAssignmentsService.js";
import {
  resolveRequestTenantScope,
  sanitizeModulePayload,
} from "../domain/gtTenantPolicy.js";

const router = Router();

const saveSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().optional(),
  userName: z.string().min(1),
  profileCode: z.string().min(1),
  inventoryId: z.string().min(1),
  locationIds: z.array(z.string().min(1)).min(1),
  selectedComponents: z
    .array(
      z.object({
        locationId: z.string().min(1),
        moduleCode: z.string().optional(),
        areaCode: z.string().optional(),
        componentLabel: z.string().optional(),
      }),
    )
    .optional(),
});

async function handleSaveAccessAssignment(req, res, payload) {
  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid access assignment payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const id = await saveAccessAssignmentService(sanitizeModulePayload("CONFIGURACION", parsed.data));
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to save access assignment",
      detail: error.message,
    });
  }
}

router.get("/access-assignments", async (req, res) => {
  try {
    const includeInactive = ["1", "true", "yes", "on"].includes(
      String(req.query.include_inactive || "").trim().toLowerCase(),
    );
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);

    const rows = await listAccessAssignmentsService({ tenantId, includeInactive });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to list access assignments",
      detail: error.message,
    });
  }
});

router.get("/access-assignments/:id", async (req, res) => {
  try {
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);
    const row = await getAccessAssignmentByIdService({ id: req.params.id, tenantId });
    if (!row) {
      return res.status(404).json({ ok: false, error: "Access assignment not found" });
    }
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to get access assignment",
      detail: error.message,
    });
  }
});

router.post("/access-assignments/save", async (req, res) => {
  return handleSaveAccessAssignment(req, res, req.body);
});

router.delete("/access-assignments/:id", async (req, res) => {
  try {
    const tenantId = resolveRequestTenantScope("CONFIGURACION", req.query.tenant_id);
    const updated = await deleteAccessAssignmentService({ id: req.params.id, tenantId });
    return res.json({ ok: true, updated });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: "Failed to delete access assignment",
      detail: error.message,
    });
  }
});

export default router;
