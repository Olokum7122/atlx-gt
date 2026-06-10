import { Router } from "express";
import { z } from "zod";
import {
  deleteComponentCatalogMappingService,
  getAreaOptionsService,
  getComponentCatalogChecklistService,
  getComponentOptionsService,
  getModuleOptionsService,
  listComponentCatalogMappingsService,
  replaceComponentCatalogMappingsService,
} from "../services/configuracion/componentCatalogsService.js";

const router = Router();

const replaceSchema = z.object({
  componentCode: z.string().min(1),
  catalogCodes: z.array(z.string()).default([]),
});

router.get("/component-catalogs", async (req, res) => {
  try {
    const rows = await listComponentCatalogMappingsService({
      moduleCode: String(req.query.module || ""),
      areaCode: String(req.query.area || ""),
      componentCode: String(req.query.component || ""),
    });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list component catalog mappings",
      detail: error.message,
    });
  }
});

router.get("/component-catalogs/checklist", async (req, res) => {
  try {
    const componentCode = String(req.query.component || "").trim();
    const items = await getComponentCatalogChecklistService(componentCode);
    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get component catalog checklist",
      detail: error.message,
    });
  }
});

router.post("/component-catalogs/replace", async (req, res) => {
  const parsed = replaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid replace payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await replaceComponentCatalogMappingsService(parsed.data);
    return res.json({ ok: true, applied: result.applied });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to replace component catalog mappings",
      detail: error.message,
    });
  }
});

router.delete("/component-catalogs/:id", async (req, res) => {
  try {
    await deleteComponentCatalogMappingService(req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to deactivate component catalog mapping",
      detail: error.message,
    });
  }
});

router.get("/component-catalogs/options/modules", async (_req, res) => {
  try {
    const options = await getModuleOptionsService();
    return res.json({ ok: true, options });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list module options",
      detail: error.message,
    });
  }
});

router.get("/component-catalogs/options/areas", async (req, res) => {
  try {
    const options = await getAreaOptionsService(String(req.query.module || ""));
    return res.json({ ok: true, options });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list area options",
      detail: error.message,
    });
  }
});

router.get("/component-catalogs/options/components", async (req, res) => {
  try {
    const options = await getComponentOptionsService(
      String(req.query.module || ""),
      String(req.query.area || ""),
    );
    return res.json({ ok: true, options });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list component options",
      detail: error.message,
    });
  }
});

export default router;
