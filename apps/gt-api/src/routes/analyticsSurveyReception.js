import { Router } from "express";
import {
  getSurveyReceptionExecutableDetailService,
  getSurveyReceptionOverviewService,
  listSurveyReceptionByExecutableService,
} from "../services/analitica/surveyReceptionService.js";

const router = Router();

function isDbLoginError(error) {
  return /login failed for user/i.test(String(error?.message || ""));
}

router.get("/survey-reception/overview", async (req, res) => {
  try {
    const limit = Number(req.query?.limit || 50);
    const result = await getSurveyReceptionOverviewService(limit);
    return res.json({ ok: true, ...result });
  } catch (error) {
    if (isDbLoginError(error)) {
      return res.json({
        ok: true,
        rows: [],
        inventory: [],
        degraded: true,
        warning: "DB login failed; returning empty reception overview for UI continuity.",
      });
    }

    return res.status(500).json({
      ok: false,
      error: "Failed to load survey reception overview",
      detail: error.message,
    });
  }
});

router.get("/survey-reception/by-executable", async (req, res) => {
  try {
    const limit = Number(req.query?.limit || 50);
    const rows = await listSurveyReceptionByExecutableService(limit);
    return res.json({ ok: true, rows });
  } catch (error) {
    if (isDbLoginError(error)) {
      return res.json({
        ok: true,
        rows: [],
        degraded: true,
        warning: "DB login failed; returning empty reception summary for UI continuity.",
      });
    }

    return res.status(500).json({
      ok: false,
      error: "Failed to load survey reception by executable",
      detail: error.message,
    });
  }
});

router.get("/survey-reception/executables/:id/detail", async (req, res) => {
  try {
    const row = await getSurveyReceptionExecutableDetailService(req.params.id);
    if (!row) {
      return res.status(404).json({
        ok: false,
        error: "Survey reception executable detail not found",
      });
    }

    return res.json({ ok: true, row });
  } catch (error) {
    if (isDbLoginError(error)) {
      return res.json({
        ok: true,
        row: null,
        degraded: true,
        warning: "DB login failed; returning empty executable detail for UI continuity.",
      });
    }

    return res.status(500).json({
      ok: false,
      error: "Failed to load survey reception executable detail",
      detail: error.message,
    });
  }
});

export default router;