import { Router } from "express";
import { z } from "zod";
import {
  getCollectorDeviceActivationStatusService,
  pullAssignedSurveysService,
  pushSubmissionService,
  requestCollectorDeviceActivationService,
} from "../services/syncService.js";

const router = Router();

const pushSchema = z.object({
  deviceId: z.string().min(2),
  submission: z.record(z.any()),
});

const activationRequestSchema = z.object({
  deviceUuid: z.string().min(8),
  requestedDeviceName: z.string().min(2),
  appVersion: z.string().optional(),
  platformCode: z.string().optional(),
  deviceModel: z.string().optional(),
});

router.get("/pull", async (req, res) => {
  const deviceId = String(req.query?.device_id || "").trim();
  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: "Missing device_id",
    });
  }

  try {
    const surveys = await pullAssignedSurveysService(deviceId);
    return res.json({
      ok: true,
      deviceId,
      surveys,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed sync pull",
      detail: error.message,
    });
  }
});

router.post("/push", async (req, res) => {
  const parsed = pushSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid sync push payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const ack = await pushSubmissionService(parsed.data);
    return res.status(202).json({
      ok: true,
      ack,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed sync push",
      detail: error.message,
    });
  }
});

router.post("/device-activation/request", async (req, res) => {
  const parsed = activationRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid activation request payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await requestCollectorDeviceActivationService(parsed.data);
    return res.status(202).json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed device activation request",
      detail: error.message,
    });
  }
});

router.get("/device-activation/status", async (req, res) => {
  const deviceUuid = String(req.query?.device_uuid || "").trim();
  if (!deviceUuid) {
    return res.status(400).json({ ok: false, error: "Missing device_uuid" });
  }

  try {
    const row = await getCollectorDeviceActivationStatusService(deviceUuid);
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed device activation status",
      detail: error.message,
    });
  }
});

const syncEnvelopeSchema = z.object({
  sourceApp: z.string().min(2),
  tenantCode: z.string().min(2),
  deviceId: z.string().min(2),
  sentAt: z.string().min(8),
  eventBatch: z.array(z.record(z.any())).default([])
});

router.post("/flash", (req, res) => {
  const parsed = syncEnvelopeSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid sync envelope",
      issues: parsed.error.issues
    });
  }

  // Placeholder: next step is storing raw payload and enqueueing normalization.
  return res.status(202).json({
    ok: true,
    accepted: true,
    receivedEvents: parsed.data.eventBatch.length
  });
});

export default router;
