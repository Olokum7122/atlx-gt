import { Router } from "express";
import { z } from "zod";
import {
  upsertDestinationService,
  listDestinationsService,
} from "../services/destinationsService.js";

const router = Router();

const upsertSchema = z.object({
  destination_id: z.string().trim().min(1),
  tenant_id: z.string().trim().min(1),
  destination_type: z.string().trim().min(1),
  display_name: z.string().trim().optional(),
  external_ref: z.string().trim().optional(),
  settings_json: z.any().optional(),
  correlation_id: z.string().trim().optional(),
  request_id: z.string().trim().optional(),
});

router.post("/destinations", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const data = await upsertDestinationService(parsed.data);
    return res.status(201).json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to upsert destination",
      detail: error.message,
    });
  }
});

router.get("/tenants/:tenantId/destinations", async (req, res) => {
  try {
    const destinationType = String(req.query.destination_type || "").trim() || null;
    const status = String(req.query.status || "").trim() || null;
    const data = await listDestinationsService(
      req.params.tenantId,
      destinationType,
      status,
    );
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list destinations",
      detail: error.message,
    });
  }
});

export default router;
