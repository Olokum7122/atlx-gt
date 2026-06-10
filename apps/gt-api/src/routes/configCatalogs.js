import { Router } from "express";
import { z } from "zod";
import {
  applyCatalogRulesService,
  deleteCatalogService,
  getCatalogByIdService,
  getCatalogRuleChecklistService,
  getModuleTabsService,
  listCatalogsService,
  saveCatalogService,
} from "../services/configuracion/catalogsService.js";

const router = Router();

const saveSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});

const applyRulesSchema = z.object({
  ruleStates: z.record(z.boolean()),
});

router.get("/catalogs", async (req, res) => {
  try {
    const includeInactive = ["1", "true", "yes", "on"].includes(
      String(req.query.include_inactive || "").trim().toLowerCase(),
    );
    const rows = await listCatalogsService({ includeInactive });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list catalogs",
      detail: error.message,
    });
  }
});

router.get("/catalogs/module-tabs", async (_req, res) => {
  try {
    const tabs = await getModuleTabsService();
    return res.json({ ok: true, tabs });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get module tabs",
      detail: error.message,
    });
  }
});

router.get("/catalogs/rules/checklist", async (req, res) => {
  try {
    const catalogId = String(req.query.catalog_id || "").trim();
    const moduleFilter = String(req.query.module || "__ALL__");
    const items = await getCatalogRuleChecklistService(catalogId, moduleFilter);
    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get catalog rules checklist",
      detail: error.message,
    });
  }
});

router.get("/catalogs/:id", async (req, res) => {
  try {
    const row = await getCatalogByIdService(req.params.id);
    if (!row) return res.status(404).json({ ok: false, error: "Catalog not found" });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get catalog",
      detail: error.message,
    });
  }
});

router.post("/catalogs", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid catalog payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const id = await saveCatalogService(parsed.data);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to save catalog",
      detail: error.message,
    });
  }
});

router.put("/catalogs/:id", async (req, res) => {
  const parsed = saveSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid catalog payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const id = await saveCatalogService(parsed.data);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to update catalog",
      detail: error.message,
    });
  }
});

router.delete("/catalogs/:id", async (req, res) => {
  try {
    await deleteCatalogService(req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to deactivate catalog",
      detail: error.message,
    });
  }
});

router.get("/catalogs/:id/rules", async (req, res) => {
  try {
    const moduleFilter = String(req.query.module || "__ALL__");
    const items = await getCatalogRuleChecklistService(req.params.id, moduleFilter);
    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get catalog rules checklist",
      detail: error.message,
    });
  }
});

router.post("/catalogs/:id/rules/apply", async (req, res) => {
  const parsed = applyRulesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid rule states payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await applyCatalogRulesService(req.params.id, parsed.data.ruleStates);
    return res.json({ ok: true, applied: result.applied });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to apply catalog rules",
      detail: error.message,
    });
  }
});

export default router;
