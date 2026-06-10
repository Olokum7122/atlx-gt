import { Router } from "express";
import { z } from "zod";
import {
  activateDimensionsService,
  approveDimensionsService,
  listDimensionsService,
  purgeAllDimensionsService,
  removeDimensionsService,
  updateDimensionService,
} from "../services/configuracion/dimensionsService.js";
import { GT_COMPATIBILITY_SCOPE_ID } from "../domain/gtTenantPolicy.js";

const router = Router();

const upsertSchema = z.object({
  dimension_id: z.string().min(3),
  tenant_id: z.string().default(GT_COMPATIBILITY_SCOPE_ID),
  dim_type: z.enum(["MODULE", "AREA", "SUBAREA", "COMPONENT"]),
  dim_code: z.string().min(3),
  node_kind: z.string().min(3),
  hierarchy_level: z.number().int().min(1).max(10),
  parent_node_id: z.string().nullable().optional(),
  label: z.string().min(1),
  review_status: z.string().default("APPROVED"),
  is_active: z.number().int().min(0).max(1).default(1),
  source: z.string().default("GT_DESIGN"),
  module_code: z.string().nullable().optional(),
  area_code: z.string().nullable().optional(),
  subarea_code: z.string().nullable().optional(),
  component_code: z.string().nullable().optional(),
  meta_json: z.string().nullable().optional(),
});

const approveSchema = z.object({
  rows: z.array(upsertSchema).min(1),
});

const updateSchema = z.object({
  dim_code: z.string().min(3),
  label: z.string().min(1).optional(),
  parent_code: z.string().nullable().optional(),
  parent_dim_code: z.string().nullable().optional(),
  dim_type: z.enum(["MODULE", "AREA", "SUBAREA", "COMPONENT"]).optional(),
  meta_json: z.string().nullable().optional(),
  metadata_patch: z.record(z.any()).optional(),
});

const removeSchema = z.object({
  dim_codes: z.array(z.string().min(3)).min(1),
});

const activateSchema = z.object({
  dim_codes: z.array(z.string().min(3)).min(1),
});

router.get("/dimensions", async (req, res) => {
  try {
    const includeInactive = ["1", "true", "yes", "on"].includes(
      String(req.query.include_inactive || "").trim().toLowerCase(),
    );
    const rows = await listDimensionsService({ includeInactive });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to list dimensions", detail: error.message });
  }
});

router.post("/dimensions/approve", async (req, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid approve payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const safeRows = parsed.data.rows.map((row) => upsertSchema.parse(row));
    const result = await approveDimensionsService(safeRows);
    return res.json({
      ok: true,
      approved: result.approved,
      rematerialized: result.rematerialized,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to approve dimensions",
      detail: error.message,
    });
  }
});

router.patch("/dimensions", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid update payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const normalizedPayload = {
      dim_code: parsed.data.dim_code,
      label: parsed.data.label,
      dim_type: parsed.data.dim_type,
      parent_code: parsed.data.parent_code ?? parsed.data.parent_dim_code ?? null,
      meta_json: parsed.data.meta_json ?? (parsed.data.metadata_patch ? JSON.stringify(parsed.data.metadata_patch) : null),
    };

    const result = await updateDimensionService(normalizedPayload);
    if (!result.found) {
      return res.status(404).json({ ok: false, error: "Dimension not found" });
    }
    return res.json({
      ok: true,
      updated: result.dimCode,
      rematerialized: result.rematerialized,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to update dimension",
      detail: error.message,
    });
  }
});

router.delete("/dimensions", async (req, res) => {
  const parsed = removeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid delete payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await removeDimensionsService(parsed.data.dim_codes);
    const { removed, rematerialized } = result;
    return res.json({ ok: true, removed, rematerialized });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to remove dimensions",
      detail: error.message,
    });
  }
});

router.delete("/dimensions/purge", async (_req, res) => {
  try {
    const result = await purgeAllDimensionsService();
    return res.json({ ok: true, purged: result.purged, rematerialized: result.rematerialized });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to purge dimensions",
      detail: error.message,
    });
  }
});

router.post("/dimensions/activate", async (req, res) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid activate payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await activateDimensionsService(parsed.data.dim_codes);
    const { activated, rematerialized } = result;
    return res.json({ ok: true, activated, rematerialized });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to activate dimensions",
      detail: error.message,
    });
  }
});

export default router;
