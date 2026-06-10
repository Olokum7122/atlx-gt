import { Router } from "express";
import { z } from "zod";
import {
  deleteClasificacionService,
  listClasificacionPairsService,
  saveClasificacionService,
} from "../services/configuracion/clasificacionesService.js";

const router = Router();

const saveSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().min(1),
  parentId: z.string().optional(),
  parentCode: z.string().optional(),
  parentName: z.string().optional(),
  childCode: z.string().optional(),
  childName: z.string().optional(),
  sortOrder: z.number().int().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get("/classifications", async (req, res) => {
  try {
    const onlyActive = ["1", "true", "yes", "on"].includes(
      String(req.query.only_active || "").trim().toLowerCase(),
    );

    const rows = await listClasificacionPairsService({
      categoryId: String(req.query.category_id || "").trim(),
      onlyActive,
    });

    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list classifications",
      detail: error.message,
    });
  }
});

router.post("/classifications", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid classification payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await saveClasificacionService(parsed.data);
    return res.json({
      ok: true,
      id: result.id,
      createdCount: result.createdCount || 0,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to save classification",
      detail: error.message,
    });
  }
});

router.put("/classifications/:id", async (req, res) => {
  const parsed = saveSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid classification payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await saveClasificacionService(parsed.data);
    return res.json({
      ok: true,
      id: result.id,
      createdCount: result.createdCount || 0,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to update classification",
      detail: error.message,
    });
  }
});

router.delete("/classifications/:id", async (req, res) => {
  try {
    await deleteClasificacionService(req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to delete classification",
      detail: error.message,
    });
  }
});

export default router;
