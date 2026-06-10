import { Router } from "express";
import { z } from "zod";
import {
  deleteSurveyResponseProfileService,
  getSurveyResponseProfileByIdService,
  listSurveyResponseProfilesService,
  saveSurveyResponseProfileService,
} from "../services/analitica/surveyResponseProfilesService.js";

const router = Router();

const optionSchema = z.object({
  optionLabel: z.string().min(1),
  optionValue: z.string().optional(),
  optionOrder: z.number().int().positive().optional(),
  weight: z.number().optional().nullable(),
});

const saveSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1),
  label: z.string().min(1),
  sectionType: z.string().min(1),
  inputType: z.string().min(1),
  isActive: z.boolean().default(true),
  createdBy: z.string().optional(),
  config: z.record(z.any()).optional(),
  options: z.array(optionSchema).optional(),
});

router.get("/survey-response-profiles", async (req, res) => {
  try {
    const includeInactive = ["1", "true", "yes", "on"].includes(
      String(req.query.include_inactive || "").trim().toLowerCase(),
    );
    const sectionType = String(req.query.section_type || "").trim().toLowerCase();
    const rows = await listSurveyResponseProfilesService({ includeInactive, sectionType });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list survey response profiles",
      detail: error.message,
    });
  }
});

router.get("/survey-response-profiles/:id", async (req, res) => {
  try {
    const row = await getSurveyResponseProfileByIdService(req.params.id);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Survey response profile not found" });
    }
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get survey response profile",
      detail: error.message,
    });
  }
});

router.post("/survey-response-profiles", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid survey response profile payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const id = await saveSurveyResponseProfileService(parsed.data);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to save survey response profile",
      detail: error.message,
    });
  }
});

router.put("/survey-response-profiles/:id", async (req, res) => {
  const parsed = saveSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid survey response profile payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const id = await saveSurveyResponseProfileService(parsed.data);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to update survey response profile",
      detail: error.message,
    });
  }
});

router.delete("/survey-response-profiles/:id", async (req, res) => {
  try {
    await deleteSurveyResponseProfileService(req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to delete survey response profile",
      detail: error.message,
    });
  }
});

export default router;