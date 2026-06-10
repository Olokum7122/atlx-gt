import { Router } from "express";
import { z } from "zod";
import {
  deleteCategoryService,
  listCategoryPairsService,
  saveCategoryService,
} from "../services/configuracion/categoriesService.js";

const router = Router();

const saveSchema = z.object({
  id: z.string().optional(),
  catalogId: z.string().min(1),
  parentId: z.string().optional(),
  parentCode: z.string().optional(),
  parentName: z.string().optional(),
  childCode: z.string().optional(),
  childName: z.string().optional(),
  sortOrder: z.number().int().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get("/categories", async (req, res) => {
  try {
    const onlyActive = ["1", "true", "yes", "on"].includes(
      String(req.query.only_active || "").trim().toLowerCase(),
    );

    const rows = await listCategoryPairsService({
      catalogId: String(req.query.catalog_id || "").trim(),
      onlyActive,
    });

    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list categories",
      detail: error.message,
    });
  }
});

router.post("/categories", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid category payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await saveCategoryService(parsed.data);
    return res.json({ ok: true, id: result.id, createdCount: result.createdCount || 0 });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to save category",
      detail: error.message,
    });
  }
});

router.put("/categories/:id", async (req, res) => {
  const parsed = saveSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid category payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await saveCategoryService(parsed.data);
    return res.json({ ok: true, id: result.id, createdCount: result.createdCount || 0 });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to update category",
      detail: error.message,
    });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    await deleteCategoryService(req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to delete category",
      detail: error.message,
    });
  }
});

export default router;
