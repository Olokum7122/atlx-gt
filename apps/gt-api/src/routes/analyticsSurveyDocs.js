import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  approveCollectorDeviceActivationService,
  cancelCollectorDeviceActivationService,
  listCollectorDeviceActivationRequestsService,
  revokeCollectorRegisteredDeviceService,
  assignSurveyToDeviceService,
  deleteSurveyDocService,
  executeSurveyDeviceDeploymentService,
  executeSurveyWebDeploymentService,
  generateSurveyPublicUrlService,
  getSurveyDocByIdService,
  listSurveyAdminQueueService,
  listSurveyAdminTransitionsByDocService,
  listSurveyDeviceTargetsService,
  listSurveyDocsService,
  listSurveyProductionControlService,
  loadCollectForSurveyService,
  publishSurveyDocService,
  registerSurveyAdminTransitionService,
  saveSurveyDocService,
} from "../services/analitica/surveyDocsService.js";

const router = Router();

const itemSchema = z.object({
  id: z.string().optional(),
  lineOrder: z.number().int().positive().optional(),
  sectionType: z.string().min(1),
  questionText: z.string().min(1),
  responseInputCode: z.string().min(1),
});

const saveSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  docCode: z.string().optional(),
  name: z.string().min(1),
  objective: z.string().optional(),
  audience: z.string().optional(),
  statusCode: z.string().optional(),
  isActive: z.boolean().optional(),
  items: z.array(itemSchema).default([]),
});

const deviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  owner: z.string().optional(),
  collectDelivery: z.string().optional(),
  userRef: z.string().optional(),
  groupCode: z.string().optional(),
  groupLabel: z.string().optional(),
  contextCode: z.string().optional(),
  channelCode: z.string().optional(),
});

const publishSchema = z.object({
  publishedBy: z.string().optional(),
  channelCode: z.enum(["web", "device", "collector", "tenant"]).optional(),
});

const deviceActionSchema = z.object({
  device: deviceSchema,
});

const adminTransitionSchema = z.object({
  actionCode: z.string().min(1),
  transitionNote: z.string().optional(),
  executableId: z.number().int().positive().optional(),
});

const executeDeviceDeploySchema = z.object({
  device: deviceSchema,
});

const activationApproveSchema = z.object({
  deviceName: z.string().min(2).optional(),
  userRef: z.string().optional(),
  groupCode: z.string().optional(),
  groupLabel: z.string().optional(),
  contextCode: z.string().optional(),
});

const deviceRegistryDeactivateSchema = z.object({
  deviceCode: z.string().min(2),
});

function appendCorrelationHeader(res, correlationId) {
  res.setHeader("x-correlation-id", correlationId);
}

function buildRequestContext(req, res) {
  const correlationId = String(req.headers["x-correlation-id"] || randomUUID()).trim();
  const actorId = String(req.headers["x-actor-id"] || "survey-admin").trim();
  const actorScopes = String(req.headers["x-actor-scopes"] || "").trim();
  const idempotencyKey = String(req.headers["x-idempotency-key"] || "").trim();

  appendCorrelationHeader(res, correlationId);

  return {
    correlationId,
    actorId,
    actorScopes,
    idempotencyKey,
  };
}

function ensureScopeOrFail(res, actorScopes, expectedScope) {
  const normalized = String(actorScopes || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (normalized.includes(expectedScope)) {
    return true;
  }

  res.status(403).json({
    ok: false,
    error: "Forbidden for current scope",
    requiredScope: expectedScope,
  });
  return false;
}

function ensureIdempotencyKeyOrFail(res, idempotencyKey) {
  if (String(idempotencyKey || "").trim()) {
    return true;
  }

  res.status(400).json({
    ok: false,
    error: "Missing idempotency key",
    requiredHeader: "x-idempotency-key",
  });
  return false;
}

function isDbLoginError(error) {
  return /login failed for user/i.test(String(error?.message || ""));
}

router.get("/survey-docs", async (_req, res) => {
  try {
    const rows = await listSurveyDocsService();
    return res.json({ ok: true, rows });
  } catch (error) {
    if (isDbLoginError(error)) {
      return res.json({
        ok: true,
        rows: [],
        degraded: true,
        warning: "DB login failed; returning empty survey docs for UI continuity.",
      });
    }

    return res.status(500).json({
      ok: false,
      error: "Failed to list survey docs",
      detail: error.message,
    });
  }
});

router.get("/survey-device-targets", async (req, res) => {
  try {
    const channelCode = String(req.query?.channelCode || "").trim().toUpperCase() || null;
    const rows = await listSurveyDeviceTargetsService(channelCode);
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list survey device targets",
      detail: error.message,
    });
  }
});

router.get("/survey-admin/queue", async (req, res) => {
  try {
    const limit = Number(req.query?.limit || 50);
    const rows = await listSurveyAdminQueueService(limit);
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list survey admin queue",
      detail: error.message,
    });
  }
});

router.get("/survey-admin/production", async (req, res) => {
  try {
    const limit = Number(req.query?.limit || 50);
    const rows = await listSurveyProductionControlService(limit);
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list survey production control",
      detail: error.message,
    });
  }
});

router.get("/survey-device-activations", async (req, res) => {
  try {
    const statusCode = String(req.query?.status || "pending").trim();
    const rows = await listCollectorDeviceActivationRequestsService(statusCode);
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list device activation requests",
      detail: error.message,
    });
  }
});

router.post("/survey-device-activations/:deviceUuid/approve", async (req, res) => {
  const requestContext = buildRequestContext(req, res);
  if (!ensureScopeOrFail(res, requestContext.actorScopes, "analytics.survey.device.approve")) {
    return;
  }
  if (!ensureIdempotencyKeyOrFail(res, requestContext.idempotencyKey)) {
    return;
  }

  const parsed = activationApproveSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid activation approval payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await approveCollectorDeviceActivationService({
      deviceUuid: req.params.deviceUuid,
      ...parsed.data,
      requestContext,
    });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to approve device activation",
      detail: error.message,
    });
  }
});

router.post("/survey-device-activations/:deviceUuid/cancel", async (req, res) => {
  const requestContext = buildRequestContext(req, res);
  if (!ensureScopeOrFail(res, requestContext.actorScopes, "analytics.survey.device.approve")) {
    return;
  }
  if (!ensureIdempotencyKeyOrFail(res, requestContext.idempotencyKey)) {
    return;
  }

  try {
    const row = await cancelCollectorDeviceActivationService({
      deviceUuid: req.params.deviceUuid,
      requestContext,
    });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to cancel device activation",
      detail: error.message,
    });
  }
});

router.post("/survey-device-targets/deactivate", async (req, res) => {
  const requestContext = buildRequestContext(req, res);
  if (!ensureScopeOrFail(res, requestContext.actorScopes, "analytics.survey.device.approve")) {
    return;
  }
  if (!ensureIdempotencyKeyOrFail(res, requestContext.idempotencyKey)) {
    return;
  }

  const parsed = deviceRegistryDeactivateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid device deactivation payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await revokeCollectorRegisteredDeviceService({
      ...parsed.data,
      requestContext,
    });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to deactivate collector device",
      detail: error.message,
    });
  }
});

router.get("/survey-docs/:id", async (req, res) => {
  try {
    const row = await getSurveyDocByIdService(req.params.id);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Survey doc not found" });
    }
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get survey doc",
      detail: error.message,
    });
  }
});

router.get("/survey-docs/:id/admin-transitions", async (req, res) => {
  try {
    const limit = Number(req.query?.limit || 80);
    const rows = await listSurveyAdminTransitionsByDocService(req.params.id, limit);
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list admin transitions by survey doc",
      detail: error.message,
    });
  }
});

router.post("/survey-docs", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid survey doc payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await saveSurveyDocService(parsed.data);
    return res.json({ ok: true, row, id: row?.id || null });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to save survey doc",
      detail: error.message,
    });
  }
});

router.put("/survey-docs/:id", async (req, res) => {
  const parsed = saveSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid survey doc payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await saveSurveyDocService(parsed.data);
    return res.json({ ok: true, row, id: row?.id || null });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to update survey doc",
      detail: error.message,
    });
  }
});

router.delete("/survey-docs/:id", async (req, res) => {
  try {
    await deleteSurveyDocService(req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to delete survey doc",
      detail: error.message,
    });
  }
});

router.post("/survey-docs/:id/publish-web", async (req, res) => {
  const requestContext = buildRequestContext(req, res);
  if (!ensureScopeOrFail(res, requestContext.actorScopes, "analytics.survey.publish")) {
    return;
  }
  if (!ensureIdempotencyKeyOrFail(res, requestContext.idempotencyKey)) {
    return;
  }

  const parsed = publishSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid publish payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await publishSurveyDocService({
      docId: req.params.id,
      publishedBy: parsed.data.publishedBy,
      channelCode: parsed.data.channelCode,
      requestContext,
    });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to publish survey doc",
      detail: error.message,
    });
  }
});

router.post("/survey-docs/:id/admin-transition", async (req, res) => {
  const requestContext = buildRequestContext(req, res);
  if (!ensureScopeOrFail(res, requestContext.actorScopes, "analytics.survey.admin.transition")) {
    return;
  }
  if (!ensureIdempotencyKeyOrFail(res, requestContext.idempotencyKey)) {
    return;
  }

  const parsed = adminTransitionSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid admin transition payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await registerSurveyAdminTransitionService({
      docId: req.params.id,
      executableId: parsed.data.executableId,
      actionCode: parsed.data.actionCode,
      transitionNote: parsed.data.transitionNote,
      requestContext,
    });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to execute admin transition",
      detail: error.message,
    });
  }
});

router.post("/survey-docs/:id/execute-device-deploy", async (req, res) => {
  const requestContext = buildRequestContext(req, res);
  if (!ensureScopeOrFail(res, requestContext.actorScopes, "analytics.survey.deploy.execute")) {
    return;
  }
  if (!ensureIdempotencyKeyOrFail(res, requestContext.idempotencyKey)) {
    return;
  }

  const parsed = executeDeviceDeploySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid execute device deploy payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await executeSurveyDeviceDeploymentService({
      docId: req.params.id,
      device: parsed.data.device,
      requestContext,
    });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to execute device deployment",
      detail: error.message,
    });
  }
});

router.post("/survey-docs/:id/execute-web-deploy", async (req, res) => {
  const requestContext = buildRequestContext(req, res);
  if (!ensureScopeOrFail(res, requestContext.actorScopes, "analytics.survey.deploy.execute")) {
    return;
  }
  if (!ensureIdempotencyKeyOrFail(res, requestContext.idempotencyKey)) {
    return;
  }

  try {
    const row = await executeSurveyWebDeploymentService({
      docId: req.params.id,
      requestContext,
    });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to execute web deployment",
      detail: error.message,
    });
  }
});

router.post("/survey-docs/:id/public-url", async (req, res) => {
  try {
    const row = await generateSurveyPublicUrlService(req.params.id);
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to generate survey public URL",
      detail: error.message,
    });
  }
});

router.post("/survey-docs/:id/load-collect", async (req, res) => {
  const requestContext = buildRequestContext(req, res);
  if (!ensureScopeOrFail(res, requestContext.actorScopes, "analytics.survey.device.load_collect")) {
    return;
  }
  if (!ensureIdempotencyKeyOrFail(res, requestContext.idempotencyKey)) {
    return;
  }

  const parsed = deviceActionSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid load collect payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await loadCollectForSurveyService({
      docId: req.params.id,
      device: parsed.data.device,
      requestContext,
    });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to queue collect load",
      detail: error.message,
    });
  }
});

router.post("/survey-docs/:id/assign-device", async (req, res) => {
  const requestContext = buildRequestContext(req, res);
  if (!ensureScopeOrFail(res, requestContext.actorScopes, "analytics.survey.device.assign")) {
    return;
  }
  if (!ensureIdempotencyKeyOrFail(res, requestContext.idempotencyKey)) {
    return;
  }

  const parsed = deviceActionSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid assign device payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await assignSurveyToDeviceService({
      docId: req.params.id,
      device: parsed.data.device,
      requestContext,
    });
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to assign survey to device",
      detail: error.message,
    });
  }
});

export default router;