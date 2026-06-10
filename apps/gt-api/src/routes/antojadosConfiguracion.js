import { Router } from "express";
import { z } from "zod";
import {
  SCOPE_TYPE,
} from "../domain/configuracion/antojadosInstanciasContracts.js";
import {
  batchApproveAntojadosDimensionsService,
  batchApproveAntojadosSubDimensionsService,
  deleteAntojadosDimensionService,
  deleteAntojadosSubDimensionService,
  getAntojadosInstanceCascadeService,
  getAntojadosInstanceService,
  getAntojadosTenantCascadeService,
  getAntojadosUserCascadeService,
  listAntojadosDimensionsService,
  listAntojadosInstancesService,
  listAntojadosSubDimensionsService,
  runAntojadosScannerSnapshotService,
  saveAntojadosScannerSelectionService,
  updateAntojadosDimensionStatusService,
  updateAntojadosDimensionProfileService,
  updateAntojadosSubDimensionStatusService,
  updateAntojadosSubDimensionProfileService,
  listAntojadosTemplatesService,
  getAntojadosTemplateService,
  rebuildAntojadosTemplateService,
  updateAntojadosTemplateLocationService,
  updateAntojadosTemplateSubLocationService,
  propagateAntojadosTemplateToUserInstancesService,
  materializeAntojadosSponsorCascadeService,
  listAntojadosSponsorsService,
  suspendAntojadosSponsorInstanceService,
  patchAntojadosInstanceLocationService,
  patchAntojadosInstanceSubLocationService,
  getAntojadosCheckedDimensionsGridService,
  replaceAntojadosCheckedDimensionsService,
  getAntojadosCheckedSubDimensionsGridService,
  replaceAntojadosCheckedSubDimensionsService,
  applyAntojadosTransversalCheckedService,
  registerAntojadosModuleOperationService,
  listAntojadosModuleOperationsService,
  getAntojadosModulesCatalogService,
  getAntojadosModulesAuditService,
  revertAntojadosModuleOperationService,
  monitorAntojadosModulesExpiryService,
  markAntojadosModuleNotifiedService,
  listAntojadosTenantExpedienteService,
  reviewAntojadosTenantExpedienteDocumentService,
  listAntojadosInstanceExpedienteService,
  reviewAntojadosInstanceExpedienteDocumentService,
  getAntojadosRegistroCorpReadinessService,
  getOrCreateAntojadosRegistroCorpVerificationService,
  listAntojadosRegistroCorpVerificationChecksService,
  upsertAntojadosRegistroCorpVerificationCheckService,
  decideAntojadosRegistroCorpVerificationService,
} from "../services/antojados/configuracionService.js";
import {
  getCheckedInvalidationState,
  publishCheckedInvalidation,
  registerCheckedInvalidationClient,
} from "../services/antojados/checkedInvalidationBus.js";

const router = Router();

const statusSchema = z.enum([
  "APPROVED",
  "PENDING_REVIEW",
  "REJECTED",
  "ACTIVE",
  "INACTIVE",
  "DEACTIVATED",
]);

const batchSchema = z.object({
  codes: z.array(z.string().min(1)).min(1),
});

const patchStatusSchema = z.object({
  status: statusSchema,
});

const patchProfileSchema = z.object({
  label: z.string().trim().min(1).max(600),
});

const checkedGridSchema = z.object({
  template_code: z.string().trim().min(1).max(100).optional(),
  scope_type: z.enum(/** @type {[string, ...string[]]} */ (Object.values(SCOPE_TYPE))).optional(),
});

const replaceCheckedDimensionsSchema = z.object({
  template_code: z.string().trim().min(1).max(100).optional(),
  scope_type: z.enum(/** @type {[string, ...string[]]} */ (Object.values(SCOPE_TYPE))).optional(),
  details: z.array(z.object({
    template_location_id: z.string().trim().min(1),
    visible: z.boolean().optional(),
    enabled: z.boolean().optional(),
    checked: z.boolean().optional(),
  }).strict()),
});

const replaceCheckedSubDimensionsSchema = z.object({
  template_code: z.string().trim().min(1).max(100).optional(),
  scope_type: z.enum(/** @type {[string, ...string[]]} */ (Object.values(SCOPE_TYPE))).optional(),
  details: z.array(z.object({
    template_sub_location_id: z.string().trim().min(1),
    visible: z.boolean().optional(),
    enabled: z.boolean().optional(),
    checked: z.boolean().optional(),
  }).strict()),
});

const applyTransversalCheckedSchema = z.object({
  template_code: z.string().trim().min(1).max(100).optional(),
  scope_type: z.enum(/** @type {[string, ...string[]]} */ (Object.values(SCOPE_TYPE))).optional(),
  propagate_sub_dimensions: z.boolean().optional(),
  toggles: z.array(z.object({
    template_location_id: z.string().trim().min(1),
    visible: z.boolean().optional(),
    enabled: z.boolean(),
  }).strict()).min(1),
}).strict();

const patchTemplateLocationSchema = z.object({
  visible: z.boolean().optional(),
  enabled: z.boolean().optional(),
  sort_order: z.number().int().optional(),
}).refine(d => d.visible !== undefined || d.enabled !== undefined || d.sort_order !== undefined, {
  message: "At least one of visible, enabled or sort_order is required",
});

const patchTemplateSubLocationSchema = z.object({
  enabled: z.boolean().optional(),
  sort_order: z.number().int().optional(),
}).refine(d => d.enabled !== undefined || d.sort_order !== undefined, {
  message: "At least one of enabled or sort_order is required",
});

const propagateTemplateSchema = z.object({
  scope_type: z.enum([SCOPE_TYPE.USER]).default(SCOPE_TYPE.USER),
  instance_type: z.literal("user").default("user"),
});

const moduleOperationItemSchema = z.object({
  location_id: z.string().trim().min(1).optional(),
  sub_location_id: z.string().trim().min(1).optional(),
  requested_visible: z.boolean(),
  requested_enabled: z.boolean(),
  plazo: z.enum(["1", "3", "6", "12"]),
  source_component_code: z.string().trim().min(1).optional(),
  source_sub_code: z.string().trim().min(1).optional(),
}).strict().refine((item) => Boolean(item.location_id || item.sub_location_id), {
  message: "location_id o sub_location_id requerido",
});

const moduleOperationSchema = z.object({
  request_id: z.string().trim().min(1).optional(),
  operation_by: z.string().trim().min(1),
  operation_at: z.string().trim().min(1).optional(),
  operation: z.object({
    items: z.array(moduleOperationItemSchema).min(1),
    summary: z.string().trim().min(1).optional(),
  }).strict(),
}).strict();

const registroCorpVerificationCheckCodeSchema = z.enum([
  "tenant_data_complete",
  "representative_data_complete",
  "google_maps_business_verified",
  "rfc_constancia_vigente",
  "representative_official_id_valid",
]);

const registroCorpVerificationCheckStateSchema = z.enum(["pending", "approved", "rejected"]);
const registroCorpVerificationDecisionStateSchema = z.enum(["approved", "rejected"]);

const registroCorpVerificationCurrentSchema = z.object({
  actor_tenant_user_id: z.string().trim().min(1).max(64).optional(),
  request_id: z.string().trim().min(1).max(120).optional(),
  correlation_id: z.string().trim().min(1).max(120).optional(),
}).strict();

const registroCorpVerificationUpsertCheckSchema = z.object({
  check_code: registroCorpVerificationCheckCodeSchema,
  check_state: registroCorpVerificationCheckStateSchema,
  actor_tenant_user_id: z.string().trim().min(1).max(64).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  evidence_ref: z.string().trim().max(500).nullable().optional(),
  evidence_json: z.string().trim().nullable().optional(),
  check_required: z.boolean().optional(),
}).strict();

const registroCorpVerificationDecisionSchema = z.object({
  decision_state: registroCorpVerificationDecisionStateSchema,
  decided_by_tenant_user_id: z.string().trim().min(1).max(64),
  decision_note: z.string().trim().max(1000).nullable().optional(),
  request_id: z.string().trim().min(1).max(120).optional(),
  correlation_id: z.string().trim().min(1).max(120).optional(),
}).strict();

function parseIsActive(value) {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

router.get("/instances", async (req, res) => {
  try {
    const rows = await listAntojadosInstancesService({
      instanceType: req.query.instance_type ?? null,
      tenantId:     req.query.tenant_id     ?? null,
      cuentaId:     req.query.cuenta_id     ?? null,
      status:       req.query.status        ?? null,
    });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to list instances", detail: error.message });
  }
});

router.get("/instances/:id", async (req, res) => {
  try {
    const row = await getAntojadosInstanceService(req.params.id);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Instance not found" });
    }
    return res.json({ ok: true, row });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get instance", detail: error.message });
  }
});

router.get("/instances/:id/cascade", async (req, res) => {
  try {
    const data = await getAntojadosInstanceCascadeService(req.params.id);
    if (!data) {
      return res.status(404).json({ ok: false, error: "Instance cascade not found" });
    }
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get instance cascade", detail: error.message });
  }
});

router.get("/tenants/:id/cascade", async (req, res) => {
  try {
    const data = await getAntojadosTenantCascadeService(req.params.id);
    if (!data) {
      return res.status(404).json({ ok: false, error: "Tenant cascade not found" });
    }
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get tenant cascade", detail: error.message });
  }
});

router.get("/users/:id/cascade", async (req, res) => {
  try {
    const data = await getAntojadosUserCascadeService(req.params.id);
    if (!data) {
      return res.status(404).json({ ok: false, error: "User cascade not found" });
    }
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get user cascade", detail: error.message });
  }
});

router.get("/instances/:id/checked/dimensions", async (req, res) => {
  const parsed = checkedGridSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const rows = await getAntojadosCheckedDimensionsGridService({
      instanceId: req.params.id,
      templateCode: parsed.data.template_code,
      scopeType: parsed.data.scope_type,
    });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get checked dimensions", detail: error.message });
  }
});

router.get("/instances/:id/checked/version", async (req, res) => {
  try {
    const state = getCheckedInvalidationState(req.params.id);
    return res.json({ ok: true, ...state });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get checked version", detail: error.message });
  }
});

router.get("/instances/:id/checked/events", async (req, res) => {
  let dispose = null;
  try {
    dispose = registerCheckedInvalidationClient(req.params.id, res);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to open checked events stream", detail: error.message });
  }

  req.on("close", () => {
    if (dispose) dispose();
  });
});

router.put("/instances/:id/checked/dimensions", async (req, res) => {
  const parsed = replaceCheckedDimensionsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await replaceAntojadosCheckedDimensionsService({
      instanceId: req.params.id,
      templateCode: parsed.data.template_code,
      scopeType: parsed.data.scope_type,
      details: parsed.data.details,
    });
    const invalidation = publishCheckedInvalidation(req.params.id, "checked_dimensions_replaced");
    return res.json({ ok: true, ...result, invalidation });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to replace checked dimensions", detail: error.message });
  }
});

router.get("/instances/:id/checked/sub-dimensions", async (req, res) => {
  const parsed = checkedGridSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const rows = await getAntojadosCheckedSubDimensionsGridService({
      instanceId: req.params.id,
      templateCode: parsed.data.template_code,
      scopeType: parsed.data.scope_type,
    });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get checked sub-dimensions", detail: error.message });
  }
});

router.put("/instances/:id/checked/sub-dimensions", async (req, res) => {
  const parsed = replaceCheckedSubDimensionsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await replaceAntojadosCheckedSubDimensionsService({
      instanceId: req.params.id,
      templateCode: parsed.data.template_code,
      scopeType: parsed.data.scope_type,
      details: parsed.data.details,
    });
    const invalidation = publishCheckedInvalidation(req.params.id, "checked_sub_dimensions_replaced");
    return res.json({ ok: true, ...result, invalidation });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to replace checked sub-dimensions", detail: error.message });
  }
});

router.post("/instances/:id/transversal/checked/apply", async (req, res) => {
  const parsed = applyTransversalCheckedSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    const result = await applyAntojadosTransversalCheckedService({
      instanceId: req.params.id,
      templateCode: parsed.data.template_code,
      scopeType: parsed.data.scope_type,
      propagateSubDimensions: parsed.data.propagate_sub_dimensions,
      toggles: parsed.data.toggles,
    });
    const invalidation = publishCheckedInvalidation(req.params.id, "checked_transversal_applied");
    return res.json({ ok: true, ...result, invalidation });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to apply transversal checked", detail: error.message });
  }
});

router.get("/dimensions", async (req, res) => {
  try {
    const rows = await listAntojadosDimensionsService({
      reviewStatus: req.query.review_status || req.query.status,
      appliesTo: req.query.applies_to,
      isActive: parseIsActive(req.query.is_active),
    });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to list dimensions", detail: error.message });
  }
});

router.get("/sub-dimensions", async (req, res) => {
  try {
    const rows = await listAntojadosSubDimensionsService({
      parentDimensionId: req.query.parent_dimension_id,
      parentCode: req.query.parent_code,
      reviewStatus: req.query.review_status || req.query.status,
      appliesTo: req.query.applies_to,
      isActive: parseIsActive(req.query.is_active),
    });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to list sub-dimensions", detail: error.message });
  }
});

router.post("/dimensions/batch-approve", async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await batchApproveAntojadosDimensionsService(parsed.data.codes);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to batch approve dimensions", detail: error.message });
  }
});

router.post("/sub-dimensions/batch-approve", async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await batchApproveAntojadosSubDimensionsService(parsed.data.codes);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to batch approve sub-dimensions", detail: error.message });
  }
});

router.patch("/dimensions/:code/status", async (req, res) => {
  const parsed = patchStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await updateAntojadosDimensionStatusService(req.params.code, parsed.data.status);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to update dimension status", detail: error.message });
  }
});

router.patch("/sub-dimensions/:code/status", async (req, res) => {
  const parsed = patchStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await updateAntojadosSubDimensionStatusService(req.params.code, parsed.data.status);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to update sub-dimension status", detail: error.message });
  }
});

router.patch("/dimensions/:code/profile", async (req, res) => {
  const parsed = patchProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await updateAntojadosDimensionProfileService(req.params.code, parsed.data);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to update dimension profile", detail: error.message });
  }
});

router.patch("/sub-dimensions/:code/profile", async (req, res) => {
  const parsed = patchProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await updateAntojadosSubDimensionProfileService(req.params.code, parsed.data);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to update sub-dimension profile", detail: error.message });
  }
});

router.delete("/dimensions/:code", async (req, res) => {
  try {
    const result = await deleteAntojadosDimensionService(req.params.code);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to delete dimension", detail: error.message });
  }
});

router.delete("/sub-dimensions/:code", async (req, res) => {
  try {
    const result = await deleteAntojadosSubDimensionService(req.params.code);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to delete sub-dimension", detail: error.message });
  }
});

router.post("/scanner/snapshot", async (req, res) => {
  try {
    const result = await runAntojadosScannerSnapshotService(req.body || {});
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to run source scanner snapshot", detail: error.message });
  }
});

router.post("/scanner/save", async (req, res) => {
  try {
    const result = await saveAntojadosScannerSelectionService(req.body || {});
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to save scanner selection", detail: error.message });
  }
});

// ─── Templates (Capa 2: canónico → plantilla) ────────────────────────────────

router.get("/templates", async (req, res) => {
  try {
    const rows = await listAntojadosTemplatesService({
      scopeType: req.query.scope_type ?? null,
    });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to list templates", detail: error.message });
  }
});

router.get("/templates/:code", async (req, res) => {
  try {
    const result = await getAntojadosTemplateService(req.params.code, {
      scopeType: req.query.scope_type ?? null,
    });
    if (!result) {
      return res.status(404).json({ ok: false, error: "Template not found" });
    }
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get template", detail: error.message });
  }
});

const rebuildTemplateSchema = z.object({
  scope_type: z.enum(/** @type {[string, ...string[]]} */ (Object.values(SCOPE_TYPE))),
});

router.post("/templates/:code/rebuild", async (req, res) => {
  try {
    const parsed = rebuildTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid payload", detail: parsed.error.flatten() });
    }
    const result = await rebuildAntojadosTemplateService({
      templateCode: req.params.code,
      scopeType:    parsed.data.scope_type,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to rebuild template", detail: error.message });
  }
});

router.patch("/templates/:code/locations/:locationId", async (req, res) => {
  const parsed = patchTemplateLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await updateAntojadosTemplateLocationService(req.params.code, req.params.locationId, {
      visible: parsed.data.visible,
      enabled: parsed.data.enabled,
      sortOrder: parsed.data.sort_order,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to patch template location", detail: error.message });
  }
});

router.patch("/templates/:code/sub-locations/:subLocationId", async (req, res) => {
  const parsed = patchTemplateSubLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await updateAntojadosTemplateSubLocationService(req.params.code, req.params.subLocationId, {
      enabled: parsed.data.enabled,
      sortOrder: parsed.data.sort_order,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to patch template sub-location", detail: error.message });
  }
});

router.post("/templates/:code/propagate-instances", async (req, res) => {
  const parsed = propagateTemplateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await propagateAntojadosTemplateToUserInstancesService({
      templateCode: req.params.code,
      scopeType: parsed.data.scope_type,
      instanceType: parsed.data.instance_type,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to propagate template to instances", detail: error.message });
  }
});

// ─── Materialize sponsor cascade (Capa 3b: plantilla → cascada por instancia) ─

router.post("/instances/:id/materialize-cascade", async (req, res) => {
  try {
    const result = await materializeAntojadosSponsorCascadeService(req.params.id);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to materialize cascade", detail: error.message });
  }
});

async function handleRegisterModuleOperation(req, res) {
  const parsed = moduleOperationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }

  const requestId = String(req.headers["x-idempotency-key"] || parsed.data.request_id || "").trim();
  if (!requestId) {
    return res.status(400).json({
      ok: false,
      error: "Missing idempotency key",
      requiredHeader: "x-idempotency-key",
    });
  }

  try {
    const result = await registerAntojadosModuleOperationService({
      instanceId: req.params.id,
      requestId,
      operationBy: parsed.data.operation_by,
      operationAt: parsed.data.operation_at,
      operation: parsed.data.operation,
    });
    const statusCode = result.replayed === true ? 200 : 201;
    return res.status(statusCode).json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to register module operation", detail: error.message });
  }
}

async function handleListModuleOperations(req, res) {
  try {
    const result = await listAntojadosModuleOperationsService(req.params.id);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to list module operations", detail: error.message });
  }
}

async function handleGetModulesCatalog(req, res) {
  try {
    const result = await getAntojadosModulesCatalogService(req.params.id);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get modules catalog", detail: error.message });
  }
}

async function handleGetModulesAudit(req, res) {
  try {
    const result = await getAntojadosModulesAuditService(req.params.id);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get modules audit", detail: error.message });
  }
}

async function handleRevertModuleOperation(req, res) {
  try {
    const result = await revertAntojadosModuleOperationService(req.params.id, req.params.requestId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to revert module operation", detail: error.message });
  }
}

async function handleMonitorModulesExpiry(req, res) {
  try {
    const warningDays = Number(req.body?.warning_days ?? 7);
    const result = await monitorAntojadosModulesExpiryService({ warningDays });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to run modules expiry monitor", detail: error.message });
  }
}

async function handleMarkModuleNotificationState(req, res) {
  try {
    const { notification_state } = req.body ?? {};
    if (!notification_state) return res.status(400).json({ ok: false, error: "notification_state requerido" });
    const result = await markAntojadosModuleNotifiedService(req.params.id, req.params.requestId, notification_state);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to mark module notification state", detail: error.message });
  }
}

router.post("/instances/:id/modules/operations", handleRegisterModuleOperation);

router.get("/instances/:id/modules/operations", handleListModuleOperations);

router.get("/instances/:id/modules/catalog", handleGetModulesCatalog);

// Auditoría: checked (intención del sponsor) vs cascada real (aplicado en GT)
router.get("/instances/:id/modules/audit", handleGetModulesAudit);

// Revert manual de un contrato vencido (Corp/GT puede forzarlo sin esperar al cron)
router.post("/instances/:id/modules/:requestId/revert", handleRevertModuleOperation);

// Monitor de plazos: auto-revierte vencidos y reporta los próximos a vencer
// Llamado por cron o desde el panel Corp
router.post("/modules/monitor-expiry", handleMonitorModulesExpiry);

// Marcar notificación enviada para un contrato próximo a vencer
router.patch("/instances/:id/modules/:requestId/notification-state", handleMarkModuleNotificationState);

// ─── Sponsors list (biz_tenants + sys_instancia WHERE instance_type='sponsor') ─

router.get("/sponsors", async (req, res) => {
  try {
    const rows = await listAntojadosSponsorsService({
      search: req.query.search ?? null,
      status: req.query.status ?? null,
      cityCode: req.query.city_code ?? null,
      businessName: req.query.business_name ?? null,
      instanceId: req.query.instance_id ?? null,
    });
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to list sponsors", detail: error.message });
  }
});

router.get("/tenants/:id/expediente", async (req, res) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 50);
    const data = await listAntojadosTenantExpedienteService(req.params.id, {
      reviewStatus: req.query.review_status ?? null,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
    });
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to list tenant expediente", detail: error.message });
  }
});

router.get("/instances/:id/expediente", async (req, res) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 50);
    const data = await listAntojadosInstanceExpedienteService(req.params.id, {
      reviewStatus: req.query.review_status ?? null,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
    });
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to list instance expediente", detail: error.message });
  }
});

router.post("/tenants/:id/expediente/:docId/review", async (req, res) => {
  const reviewStatus = String(req.body?.review_status || "").trim().toLowerCase();
  const reviewedBy = String(req.body?.reviewed_by || "").trim();
  if (!reviewStatus || !["approved", "rejected"].includes(reviewStatus)) {
    return res.status(400).json({ ok: false, error: "review_status invalido. Permitidos: approved, rejected" });
  }
  if (!reviewedBy) {
    return res.status(400).json({ ok: false, error: "reviewed_by es requerido" });
  }

  try {
    const data = await reviewAntojadosTenantExpedienteDocumentService(
      req.params.id,
      req.params.docId,
      {
        review_status: reviewStatus,
        reviewed_by: reviewedBy,
        review_notes: req.body?.review_notes ?? null,
      },
    );
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to review expediente document", detail: error.message });
  }
});

router.post("/instances/:id/expediente/:docId/review", async (req, res) => {
  const reviewStatus = String(req.body?.review_status || "").trim().toLowerCase();
  const reviewedBy = String(req.body?.reviewed_by || "").trim();
  if (!reviewStatus || !["approved", "rejected"].includes(reviewStatus)) {
    return res.status(400).json({ ok: false, error: "review_status invalido. Permitidos: approved, rejected" });
  }
  if (!reviewedBy) {
    return res.status(400).json({ ok: false, error: "reviewed_by es requerido" });
  }

  try {
    const data = await reviewAntojadosInstanceExpedienteDocumentService(
      req.params.id,
      req.params.docId,
      {
        review_status: reviewStatus,
        reviewed_by: reviewedBy,
        review_notes: req.body?.review_notes ?? null,
      },
    );
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to review expediente document", detail: error.message });
  }
});

router.get("/instances/:id/registro-corp/readiness", async (req, res) => {
  try {
    const data = await getAntojadosRegistroCorpReadinessService(req.params.id);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to calculate registro corp readiness", detail: error.message });
  }
});

router.post("/instances/:id/registro-corp/verification/current", async (req, res) => {
  const parsed = registroCorpVerificationCurrentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    const data = await getOrCreateAntojadosRegistroCorpVerificationService(req.params.id, parsed.data);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to get/create registro corp verification", detail: error.message });
  }
});

router.get("/instances/:id/registro-corp/verification/:verificationId/checks", async (req, res) => {
  try {
    const data = await listAntojadosRegistroCorpVerificationChecksService(req.params.id, req.params.verificationId);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to list registro corp verification checks", detail: error.message });
  }
});

router.post("/instances/:id/registro-corp/verification/:verificationId/checks", async (req, res) => {
  const parsed = registroCorpVerificationUpsertCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    const data = await upsertAntojadosRegistroCorpVerificationCheckService(
      req.params.id,
      req.params.verificationId,
      parsed.data,
    );
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to upsert registro corp verification check", detail: error.message });
  }
});

router.post("/instances/:id/registro-corp/verification/:verificationId/decide", async (req, res) => {
  const parsed = registroCorpVerificationDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    const data = await decideAntojadosRegistroCorpVerificationService(
      req.params.id,
      req.params.verificationId,
      parsed.data,
    );
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to decide registro corp verification", detail: error.message });
  }
});

router.post("/instances/:id/suspend", async (req, res) => {
  try {
    const result = await suspendAntojadosSponsorInstanceService(req.params.id);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to suspend sponsor instance", detail: error.message });
  }
});

// ─── Toggle visible/enabled en cascade de sponsor ────────────────────────────

const contractConfigSchema = z.object({
  module_code: z.string().trim().min(1).max(100).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  required: z.boolean().optional(),
  plazo_options: z.array(z.enum(["1", "3", "6", "12"])).min(1).optional(),
  default_plazo: z.enum(["1", "3", "6", "12"]).optional(),
  sort_order: z.number().int().optional(),
}).strict().refine((d) => (
  d.module_code !== undefined
  || d.label !== undefined
  || d.description !== undefined
  || d.required !== undefined
  || d.plazo_options !== undefined
  || d.default_plazo !== undefined
  || d.sort_order !== undefined
), {
  message: "contract_config requiere al menos un campo",
});

const patchLocationSchema = z.object({
  visible: z.boolean().optional(),
  enabled: z.boolean().optional(),
  module_code: z.string().trim().min(1).max(100).optional(),
  contract_config: contractConfigSchema.optional(),
}).refine(d => d.visible !== undefined || d.enabled !== undefined || d.module_code !== undefined || d.contract_config !== undefined, {
  message: "At least one of visible, enabled, module_code or contract_config is required",
});

const patchSubLocationSchema = z.object({
  enabled: z.boolean(),
});

router.patch("/instances/:id/locations/:locationId", async (req, res) => {
  const parsed = patchLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await patchAntojadosInstanceLocationService(req.params.id, req.params.locationId, parsed.data);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to patch location", detail: error.message });
  }
});

router.patch("/instances/:id/sub-locations/:subId", async (req, res) => {
  const parsed = patchSubLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    const result = await patchAntojadosInstanceSubLocationService(req.params.id, req.params.subId, parsed.data.enabled);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Failed to patch sub-location", detail: error.message });
  }
});

export default router;