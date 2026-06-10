import { Router } from "express";
import { z } from "zod";
import {
  acceptElectronicSignatureActivationService,
  authorizeElectronicSignatureActionService,
  createElectronicSignatureService,
  distributeElectronicSignatureOutputsService,
  getElectronicSignatureStatusService,
  sendElectronicSignatureActivationService,
} from "../services/antojados/efirmaService.js";

const router = Router();

const createSchema = z.object({
  instance_id: z.string().trim().min(1),
  representative_tenant_user_id: z.string().trim().min(1),
  created_by_tenant_user_id: z.string().trim().min(1).optional(),
  correlation_id: z.string().trim().min(1).optional(),
  request_id: z.string().trim().min(1).optional(),
});

const sendActivationSchema = z.object({
  instance_id: z.string().trim().min(1),
  actor_tenant_user_id: z.string().trim().min(1),
  notified_tenant_user_id: z.string().trim().min(1).optional(),
  activation_token: z.string().trim().min(8).optional(),
  token_hash: z.string().trim().min(16).optional(),
  expires_at: z.string().trim().min(10).optional(),
  channel: z.string().trim().min(1).optional(),
  correlation_id: z.string().trim().min(1).optional(),
  request_id: z.string().trim().min(1).optional(),
});

const acceptActivationSchema = z.object({
  instance_id: z.string().trim().min(1),
  activation_id: z.string().trim().min(1),
  actor_tenant_user_id: z.string().trim().min(1),
  credential_validated: z.boolean(),
  correlation_id: z.string().trim().min(1).optional(),
  request_id: z.string().trim().min(1).optional(),
});

const authorizeSchema = z.object({
  instance_id: z.string().trim().min(1),
  requested_by_tenant_user_id: z.string().trim().min(1),
  action_code: z.string().trim().min(1),
  resource_type: z.string().trim().min(1),
  resource_id: z.string().trim().min(1),
  operation_id: z.string().trim().min(1).optional(),
  credential_validated: z.boolean(),
  expires_at: z.string().trim().min(10).optional(),
  correlation_id: z.string().trim().min(1).optional(),
  request_id: z.string().trim().min(1).optional(),
});

const distributeSchema = z.object({
  instance_id: z.string().trim().min(1),
  actor_tenant_user_id: z.string().trim().min(1),
  contract_resource_id: z.string().trim().min(1).optional(),
  modules_resource_id: z.string().trim().min(1).optional(),
  correlation_id: z.string().trim().min(1).optional(),
  request_id: z.string().trim().min(1).optional(),
});

router.post("/efirma/create", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    const data = await createElectronicSignatureService(parsed.data);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to create electronic signature", detail: error.message });
  }
});

router.post("/efirma/send-activation", async (req, res) => {
  const parsed = sendActivationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    const data = await sendElectronicSignatureActivationService(parsed.data);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to send activation", detail: error.message });
  }
});

router.post("/efirma/accept-activation", async (req, res) => {
  const parsed = acceptActivationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    const data = await acceptElectronicSignatureActivationService(parsed.data);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to accept activation", detail: error.message });
  }
});

router.post("/efirma/authorize-action", async (req, res) => {
  const parsed = authorizeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    const data = await authorizeElectronicSignatureActionService(parsed.data);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to authorize action", detail: error.message });
  }
});

router.post("/efirma/distribute", async (req, res) => {
  const parsed = distributeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    const data = await distributeElectronicSignatureOutputsService(parsed.data);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to distribute electronic signature", detail: error.message });
  }
});

router.get("/efirma/status", async (req, res) => {
  const instanceId = String(req.query.instance_id || "").trim();
  if (!instanceId) {
    return res.status(400).json({ ok: false, error: "instance_id requerido" });
  }

  try {
    const data = await getElectronicSignatureStatusService(instanceId);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get electronic signature status", detail: error.message });
  }
});

export default router;
