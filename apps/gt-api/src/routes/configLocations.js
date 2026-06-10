import { Router } from "express";
import { z } from "zod";
import {
  bulkSetLocationVisibilityService,
  deleteLocationService,
  getLocationByIdService,
  listLocationCascadeComponentsService,
  listLocationsService,
  purgeLocationCascadeService,
  rebuildLocationCascadeService,
  saveLocationAggregateService,
} from "../services/configuracion/locationsService.js";

const router = Router();

const saveSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean().optional(),
  moduleCodes: z.array(z.string()).optional(),
});

const visibilitySchema = z.object({
  locationIds: z.array(z.string().min(1)).min(1),
  isActive: z.boolean(),
});

function isDbLoginError(error) {
  return /login failed for user/i.test(String(error?.message || ""));
}

router.get("/locations", async (req, res) => {
  try {
    const includeInactive = ["1", "true", "yes", "on"].includes(
      String(req.query.include_inactive || "").trim().toLowerCase(),
    );
    const rows = await listLocationsService({ includeInactive });
    return res.json({ ok: true, rows });
  } catch (error) {
    if (isDbLoginError(error)) {
      return res.json({
        ok: true,
        rows: [],
        degraded: true,
        warning: "DB login failed; returning empty locations for UI continuity.",
      });
    }

    return res.status(500).json({
      ok: false,
      error: "Failed to list locations",
      detail: error.message,
    });
  }
});

router.get("/locations/:id", async (req, res) => {
  try {
    const row = await getLocationByIdService(req.params.id);
    if (!row) return res.status(404).json({ ok: false, error: "Location not found" });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get location",
      detail: error.message,
    });
  }
});

router.post("/locations/save-aggregate", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid save payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const id = await saveLocationAggregateService(parsed.data);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to save location aggregate",
      detail: error.message,
    });
  }
});

router.delete("/locations/:id/cascade", async (req, res) => {
  try {
    const purged = await purgeLocationCascadeService(req.params.id);
    return res.json({ ok: true, purged });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to purge location cascade",
      detail: error.message,
    });
  }
});

router.post("/locations/:id/rebuild-cascade", async (req, res) => {
  try {
    const rebuiltId = await rebuildLocationCascadeService(req.params.id);
    if (!rebuiltId) {
      return res.status(404).json({ ok: false, error: "Location not found" });
    }
    return res.json({ ok: true, id: rebuiltId });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to rebuild location cascade",
      detail: error.message,
    });
  }
});

router.get("/locations/:id/cascade-components", async (req, res) => {
  try {
    const includeInactive = ["1", "true", "yes", "on"].includes(
      String(req.query.include_inactive || "").trim().toLowerCase(),
    );
    const moduleCode = String(req.query.module_code || "").trim();
    const areaCodes = String(req.query.area_codes || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => Boolean(value));

    const rows = await listLocationCascadeComponentsService({
      instanceId: req.params.id,
      moduleCode,
      areaCodes,
      includeInactive,
    });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list cascade components",
      detail: error.message,
    });
  }
});

router.patch("/locations/:id/cascade-visibility", async (req, res) => {
  const parsed = visibilitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid visibility payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const updated = await bulkSetLocationVisibilityService({
      instanceId: req.params.id,
      locationIds: parsed.data.locationIds,
      isActive: parsed.data.isActive,
    });
    return res.json({ ok: true, updated });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to update cascade visibility",
      detail: error.message,
    });
  }
});

router.delete("/locations/:id", async (req, res) => {
  try {
    await deleteLocationService(req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to deactivate location",
      detail: error.message,
    });
  }
});

export default router;
