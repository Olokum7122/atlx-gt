import {
  getAntojadosInstanceCascadeCrud,
  getAntojadosInstanceCrud,
  approveAntojadosDimensionsCrud,
  approveAntojadosSubDimensionsCrud,
  deleteAntojadosDimensionCrud,
  deleteAntojadosSubDimensionCrud,
  getAntojadosTenantCascadeCrud,
  getAntojadosUserCascadeCrud,
  listAntojadosDimensionsCrud,
  listAntojadosInstancesCrud,
  listAntojadosSubDimensionsCrud,
  updateAntojadosDimensionStatusCrud,
  updateAntojadosDimensionProfileCrud,
  updateAntojadosSubDimensionStatusCrud,
  updateAntojadosSubDimensionProfileCrud,
  listAntojadosTemplatesCrud,
  getAntojadosTemplateCrud,
  rebuildAntojadosTemplateCrud,
  materializeAntojadosSponsorCascadeCrud,
  listAntojadosSponsorsCrud,
  suspendAntojadosSponsorInstanceCrud,
  patchAntojadosInstanceLocationEnabledCrud,
  patchAntojadosInstanceSubLocationEnabledCrud,
  updateAntojadosTemplateLocationCrud,
  updateAntojadosTemplateSubLocationCrud,
  propagateAntojadosTemplateToUserInstancesCrud,
  getAntojadosCheckedDimensionsGridCrud,
  replaceAntojadosCheckedDimensionsCrud,
  getAntojadosCheckedSubDimensionsGridCrud,
  replaceAntojadosCheckedSubDimensionsCrud,
  registerAntojadosSignedContractCrud,
  listAntojadosSignedContractsCrud,
  applyAntojadosSponsorContractDiffCrud,
  getAntojadosSponsorContractLatestItemsCrud,
  revertAntojadosSponsorContractCrud,
  getAntojadosExpiringContractsCrud,
  markAntojadosContractNotifiedCrud,
  getOrCreateAntojadosRegistroCorpVerificationCrud,
  listAntojadosRegistroCorpVerificationChecksCrud,
  upsertAntojadosRegistroCorpVerificationCheckCrud,
  decideAntojadosRegistroCorpVerificationCrud,
} from "../../infra/dorado/antojadosConfigCrudDorado.js";
import { INSTANCE_TYPE } from "../../domain/configuracion/antojadosInstanciasContracts.js";
import { config } from "../../config.js";
import { createHash } from "node:crypto";

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(payload) {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

const DEFAULT_CONTRACT_PLAZO_OPTIONS = ["1", "3", "6", "12"];

const CANONICAL_MODULES = [
  {
    itemCode: "VAS_IR",
    label: "Vas ir",
    sortOrder: 10,
    required: true,
    match: ({ areaCode, componentCode }) => areaCode === "ANTOJO.VAS_IR" || componentCode.startsWith("ANTOJO.VAS_IR."),
  },
  {
    itemCode: "ARRE",
    label: "Arre",
    sortOrder: 20,
    required: false,
    match: ({ areaCode, componentCode }) => areaCode === "ANTOJO.ARRE" || componentCode.startsWith("ANTOJO.ARRE."),
  },
  {
    itemCode: "LOS_CHIDOS",
    label: "Los Chidos",
    sortOrder: 30,
    required: false,
    match: ({ areaCode, componentCode }) => areaCode === "ANTOJO.LOS_CHIDOS" || componentCode.startsWith("ANTOJO.LOS_CHIDOS."),
  },
  {
    itemCode: "METRICAS",
    label: "Metricas",
    sortOrder: 40,
    required: false,
    match: ({ componentCode }) => componentCode === "ANTOJO.MI_CHAMBA.METRICAS" || componentCode.endsWith(".METRICAS"),
  },
  {
    itemCode: "NO_VAS_IR",
    label: "No vas ir",
    sortOrder: 50,
    required: false,
    match: ({ areaCode, componentCode }) => areaCode === "ANTOJO.NO_VAS_IR" || componentCode.startsWith("ANTOJO.NO_VAS_IR."),
  },
];

const WORKSPACE_GOVERNED_MODULE_CODES = new Set(["VAS_IR", "LOS_CHIDOS"]);

function isWorkspaceGovernedModuleCode(moduleCode) {
  return WORKSPACE_GOVERNED_MODULE_CODES.has(normalizeModuleCode(moduleCode));
}

function isWorkspaceGovernedDimensionRow(row) {
  const componentCode = String(row?.component_code || "").trim().toUpperCase();
  const dimensionCode = String(row?.dimension_code || "").trim().toUpperCase();
  return (
    componentCode === "ANTOJO.VAS_IR"
    || componentCode.startsWith("ANTOJO.VAS_IR.")
    || dimensionCode === "ANTOJO.VAS_IR"
    || dimensionCode.startsWith("ANTOJO.VAS_IR.")
    || componentCode === "ANTOJO.LOS_CHIDOS"
    || componentCode.startsWith("ANTOJO.LOS_CHIDOS.")
    || dimensionCode === "ANTOJO.LOS_CHIDOS"
    || dimensionCode.startsWith("ANTOJO.LOS_CHIDOS.")
  );
}

function parseMetaJson(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function normalizeRegistroCorpSponsorStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["approved", "active", "aprobado"].includes(normalized)) return "approved";
  return normalized;
}

function isRegistroCorpSponsorApproved(value) {
  return normalizeRegistroCorpSponsorStatus(value) === "approved";
}

function normalizePlazo(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "3", "6", "12"].includes(normalized)) return normalized;
  return "";
}

function normalizePlazoOptions(values, required) {
  const rawValues = Array.isArray(values) ? values : [];
  const options = Array.from(
    new Set(rawValues.map((item) => normalizePlazo(item)).filter(Boolean)),
  );
  if (options.length > 0) return options;
  return required ? ["12"] : [...DEFAULT_CONTRACT_PLAZO_OPTIONS];
}

function resolveCanonicalModule(location) {
  const areaCode = String(location?.area_code || "").trim();
  const componentCode = String(location?.component_code || "").trim();
  return CANONICAL_MODULES.find((moduleDef) => moduleDef.match({ areaCode, componentCode })) || null;
}

function normalizeModuleCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeContractConfigPatch(raw = {}) {
  if (!raw || typeof raw !== "object") return {};

  const patch = {};
  if (raw.module_code !== undefined) {
    const moduleCode = normalizeModuleCode(raw.module_code);
    patch.contract_module_code = moduleCode || null;
  }
  if (raw.label !== undefined) {
    patch.contract_module_label = String(raw.label || "").trim() || null;
  }
  if (raw.description !== undefined) {
    patch.contract_description = String(raw.description || "").trim() || null;
  }
  if (raw.required !== undefined) {
    patch.contract_required = Boolean(raw.required);
  }
  if (raw.plazo_options !== undefined) {
    const options = normalizePlazoOptions(raw.plazo_options, Boolean(raw.required));
    patch.contract_plazo_options = options;
  }
  if (raw.default_plazo !== undefined) {
    patch.contract_default_plazo = normalizePlazo(raw.default_plazo) || null;
  }
  if (raw.sort_order !== undefined) {
    const sortOrder = Number(raw.sort_order);
    patch.contract_sort_order = Number.isFinite(sortOrder) ? sortOrder : null;
  }

  return patch;
}

function resolveCatalogModuleDefinition(location, meta) {
  const canonical = resolveCanonicalModule(location);
  const moduleCode = normalizeModuleCode(
    meta?.contract_module_code
    ?? meta?.module_code
    ?? location?.module_code
    ?? canonical?.itemCode,
  );
  if (!moduleCode) return null;

  const sortOrderRaw = Number(meta?.contract_sort_order ?? meta?.sort_order ?? canonical?.sortOrder ?? 999);
  const sortOrder = Number.isFinite(sortOrderRaw) ? sortOrderRaw : 999;

  return {
    itemCode: moduleCode,
    label: String(
      meta?.contract_module_label
      ?? meta?.contract_label
      ?? location?.label
      ?? canonical?.label
      ?? moduleCode,
    ).trim(),
    required: Boolean(canonical?.required) || toBoolean(meta?.contract_required ?? meta?.required),
    sortOrder,
  };
}

async function setContractNotificationState(instanceId, requestId, notificationState) {
  if (!instanceId || !requestId || !notificationState) return;
  await markAntojadosContractNotifiedCrud(instanceId, requestId, notificationState);
}

async function createAttentionNotification(instanceId, payload) {
  const response = await fetch(
    `${config.antojadosApiBaseUrl}/antojados/gt/instancias/${encodeURIComponent(instanceId)}/notifications`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(`ATENCION notification failed (${response.status}): ${raw || "upstream error"}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

async function notifyModuleOperationResult(instanceId, requestId, activationState) {
  const normalizedState = String(activationState || "").trim().toLowerCase();
  const stateLabel = normalizedState || "ok";
  return createAttentionNotification(instanceId, {
    notification_type: "operational",
    title: "Actualizacion de modulos aplicada",
    message: `La operacion ${requestId} quedo en estado ${stateLabel}. Revisa los modulos activos y su vigencia.`,
    cta_label: "Ver modulos",
    cta_deeplink: "/mi-chamba/modulos",
    dismissable: true,
  });
}

async function notifyModuleExpiryWarning(instanceId, requestId, validUntil) {
  return createAttentionNotification(instanceId, {
    notification_type: "contract_alert",
    title: "Tus modulos estan por vencer",
    message: `La operacion ${requestId} vence el ${validUntil}. Renueva a tiempo para evitar desactivacion automatica.`,
    cta_label: "Revisar modulos",
    cta_deeplink: "/mi-chamba/modulos",
    dismissable: false,
  });
}

async function notifyModuleRevert(instanceId, requestId) {
  return createAttentionNotification(instanceId, {
    notification_type: "operational",
    title: "Modulos desactivados por vencimiento",
    message: `La operacion ${requestId} vencio y GT revirtio la activacion en Locations Sponsor.`,
    cta_label: "Ver modulos",
    cta_deeplink: "/mi-chamba/modulos",
    dismissable: false,
  });
}

export async function listAntojadosDimensionsService(filters = {}) {
  const query = new URLSearchParams();
  if (filters.reviewStatus) query.set("review_status", String(filters.reviewStatus));
  if (filters.appliesTo) query.set("applies_to", String(filters.appliesTo));
  if (filters.isActive !== undefined && filters.isActive !== null) {
    query.set("is_active", filters.isActive ? "1" : "0");
  }

  const response = await fetch(
    `${config.antojadosApiBaseUrl}/antojados/gt/dimensions${query.toString() ? `?${query.toString()}` : ""}`,
  );

  const data = await response.json().catch(() => ({
    ok: false,
    error: "Invalid upstream response",
  }));

  if (!response.ok) {
    const message = data?.error || `Upstream dimensions failed (${response.status})`;
    throw new Error(message);
  }

  if (Array.isArray(data)) return data;
  return Array.isArray(data?.rows) ? data.rows : [];
}

export async function listAntojadosInstancesService(filters = {}) {
  return listAntojadosInstancesCrud(filters);
}

export async function getAntojadosInstanceService(instanceId) {
  return getAntojadosInstanceCrud(instanceId);
}

export async function getAntojadosInstanceCascadeService(instanceId) {
  return getAntojadosInstanceCascadeCrud(instanceId);
}

export async function getAntojadosTenantCascadeService(tenantId) {
  return getAntojadosTenantCascadeCrud(tenantId);
}

export async function getAntojadosUserCascadeService(userId) {
  return getAntojadosUserCascadeCrud(userId);
}

export async function listAntojadosSubDimensionsService(filters = {}) {
  const query = new URLSearchParams();
  if (filters.parentDimensionId) {
    query.set("parent_dimension_id", String(filters.parentDimensionId));
  }
  if (filters.parentCode) query.set("parent_code", String(filters.parentCode));
  if (filters.reviewStatus) query.set("review_status", String(filters.reviewStatus));
  if (filters.appliesTo) query.set("applies_to", String(filters.appliesTo));
  if (filters.isActive !== undefined && filters.isActive !== null) {
    query.set("is_active", filters.isActive ? "1" : "0");
  }

  const response = await fetch(
    `${config.antojadosApiBaseUrl}/antojados/gt/sub-dimensions${query.toString() ? `?${query.toString()}` : ""}`,
  );

  const data = await response.json().catch(() => ({
    ok: false,
    error: "Invalid upstream response",
  }));

  if (!response.ok) {
    const message = data?.error || `Upstream sub-dimensions failed (${response.status})`;
    throw new Error(message);
  }

  if (Array.isArray(data)) return data;
  return Array.isArray(data?.rows) ? data.rows : [];
}

export async function batchApproveAntojadosDimensionsService(codes = []) {
  const updated = await approveAntojadosDimensionsCrud(codes);
  return { updated };
}

export async function batchApproveAntojadosSubDimensionsService(codes = []) {
  const updated = await approveAntojadosSubDimensionsCrud(codes);
  return { updated };
}

export async function updateAntojadosDimensionStatusService(code, status) {
  const normalized = await updateAntojadosDimensionStatusCrud(code, status);
  return { dimension_code: code, status: normalized };
}

export async function updateAntojadosSubDimensionStatusService(code, status) {
  const normalized = await updateAntojadosSubDimensionStatusCrud(code, status);
  return { sub_code: code, status: normalized };
}

export async function updateAntojadosDimensionProfileService(code, payload = {}) {
  return updateAntojadosDimensionProfileCrud(code, payload);
}

export async function updateAntojadosSubDimensionProfileService(code, payload = {}) {
  return updateAntojadosSubDimensionProfileCrud(code, payload);
}

export async function listAntojadosTemplatesService(filters = {}) {
  return listAntojadosTemplatesCrud(filters);
}

export async function getAntojadosTemplateService(templateCode, filters = {}) {
  return getAntojadosTemplateCrud(templateCode, filters);
}

export async function rebuildAntojadosTemplateService(payload) {
  return rebuildAntojadosTemplateCrud(payload);
}

export async function updateAntojadosTemplateLocationService(templateCode, templateLocationId, payload) {
  return updateAntojadosTemplateLocationCrud(templateCode, templateLocationId, payload);
}

export async function updateAntojadosTemplateSubLocationService(templateCode, templateSubLocationId, payload) {
  return updateAntojadosTemplateSubLocationCrud(templateCode, templateSubLocationId, payload);
}

export async function propagateAntojadosTemplateToUserInstancesService(payload) {
  return propagateAntojadosTemplateToUserInstancesCrud(payload);
}

export async function materializeAntojadosSponsorCascadeService(instanceId) {
  const before = await getAntojadosInstanceCascadeCrud(instanceId);
  const result = await materializeAntojadosSponsorCascadeCrud(instanceId);
  const after = await getAntojadosInstanceCascadeCrud(instanceId);

  return {
    ...result,
    dimension_locations_count: Array.isArray(after?.dimension_locations) ? after.dimension_locations.length : 0,
    sub_dimension_locations_count: Array.isArray(after?.sub_dimension_locations) ? after.sub_dimension_locations.length : 0,
    cascade_before: before,
    cascade_after: after,
  };
}

export async function listAntojadosSponsorsService(filters = {}) {
  return listAntojadosSponsorsCrud(filters);
}

export async function suspendAntojadosSponsorInstanceService(instanceId) {
  return suspendAntojadosSponsorInstanceCrud(instanceId);
}

export async function patchAntojadosInstanceLocationService(instanceId, locationId, payload) {
  const normalizedInstanceId = String(instanceId || "").trim();
  const normalizedLocationId = String(locationId || "").trim();

  if (!normalizedInstanceId || !normalizedLocationId) {
    throw new Error("patchAntojadosInstanceLocationService: instanceId y locationId requeridos");
  }

  let moduleCode;
  let metaJson;

  const hasContractConfigPatch = payload?.contract_config && typeof payload.contract_config === "object";
  const hasModuleCodePatch = payload?.module_code !== undefined;

  if (hasContractConfigPatch || hasModuleCodePatch) {
    const cascade = await getAntojadosInstanceCascadeCrud(normalizedInstanceId);
    const row = (cascade?.dimension_locations || []).find(
      (item) => String(item?.location_id || "").trim() === normalizedLocationId,
    );
    if (!row) {
      throw new Error("patchAntojadosInstanceLocationService: location no encontrada en cascada de instancia");
    }

    const currentMeta = parseMetaJson(row?.meta_json);
    const contractPatch = normalizeContractConfigPatch(payload?.contract_config || {});

    const mergedMeta = {
      ...currentMeta,
      ...contractPatch,
    };

    metaJson = JSON.stringify(mergedMeta);

    const explicitModuleCode = hasModuleCodePatch
      ? normalizeModuleCode(payload?.module_code)
      : "";
    const patchedModuleCode = normalizeModuleCode(contractPatch.contract_module_code);
    const currentModuleCode = normalizeModuleCode(row?.module_code);

    moduleCode = explicitModuleCode || patchedModuleCode || currentModuleCode || null;
  }

  return patchAntojadosInstanceLocationEnabledCrud(normalizedInstanceId, normalizedLocationId, {
    visible: payload?.visible,
    enabled: payload?.enabled,
  });
}

export async function patchAntojadosInstanceSubLocationService(instanceId, subId, enabled) {
  return patchAntojadosInstanceSubLocationEnabledCrud(instanceId, subId, enabled);
}

export async function getAntojadosCheckedDimensionsGridService(payload) {
  return getAntojadosCheckedDimensionsGridCrud(payload);
}

export async function replaceAntojadosCheckedDimensionsService(payload) {
  return replaceAntojadosCheckedDimensionsCrud(payload);
}

export async function getAntojadosCheckedSubDimensionsGridService(payload) {
  return getAntojadosCheckedSubDimensionsGridCrud(payload);
}

export async function replaceAntojadosCheckedSubDimensionsService(payload) {
  return replaceAntojadosCheckedSubDimensionsCrud(payload);
}

export async function applyAntojadosTransversalCheckedService(payload) {
  const normalizedInstanceId = String(payload?.instanceId || "").trim();
  if (!normalizedInstanceId) {
    throw new Error("applyAntojadosTransversalCheckedService: instanceId requerido");
  }

  const toggles = Array.isArray(payload?.toggles) ? payload.toggles : [];
  if (toggles.length === 0) {
    throw new Error("applyAntojadosTransversalCheckedService: toggles requeridos");
  }

  const templateCode = payload?.templateCode;
  const scopeType = payload?.scopeType;
  const propagateSubDimensions = payload?.propagateSubDimensions !== false;

  const [dimensionRows, subDimensionRows] = await Promise.all([
    getAntojadosCheckedDimensionsGridCrud({
      instanceId: normalizedInstanceId,
      templateCode,
      scopeType,
    }),
    getAntojadosCheckedSubDimensionsGridCrud({
      instanceId: normalizedInstanceId,
      templateCode,
      scopeType,
    }),
  ]);

  const toggleByTemplateLocationId = new Map(
    toggles.map((toggle) => [
      String(toggle.template_location_id).trim(),
      {
        enabled: Boolean(toggle.enabled),
        visible: toggle.visible == null ? undefined : Boolean(toggle.visible),
      },
    ]),
  );

  const skippedWorkspaceGoverned = [];

  const toggleByDimensionCode = new Map();
  const dimensionDetails = dimensionRows.map((row) => {
    const templateLocationId = String(row?.template_location_id || "").trim();
    const dimensionCode = String(row?.dimension_code || "").trim();

    let override = toggleByTemplateLocationId.get(templateLocationId);
    if (override && isWorkspaceGovernedDimensionRow(row)) {
      skippedWorkspaceGoverned.push({
        template_location_id: templateLocationId,
        dimension_code: dimensionCode || null,
        component_code: String(row?.component_code || "").trim() || null,
      });
      override = null;
    }

    const hasOverride = override != null;
    const enabled = hasOverride
      ? Boolean(override.enabled)
      : Boolean(row?.effective_enabled);
    const visible = hasOverride && override.visible != null
      ? Boolean(override.visible)
      : Boolean(row?.effective_visible);
    const checked = Boolean(row?.effective_checked ?? row?.checked ?? (visible || enabled));

    if (hasOverride && dimensionCode) {
      toggleByDimensionCode.set(dimensionCode, enabled);
    }

    return {
      template_location_id: templateLocationId,
      visible,
      enabled,
      checked,
    };
  });

  const subDimensionDetails = subDimensionRows.map((row) => {
    const subCode = String(row?.sub_code || "").trim();
    let enabled = Boolean(row?.effective_enabled ?? row?.enabled);

    if (propagateSubDimensions && subCode) {
      for (const [dimensionCode, toggledEnabled] of toggleByDimensionCode.entries()) {
        if (subCode.startsWith(`${dimensionCode}.`)) {
          enabled = toggledEnabled;
          break;
        }
      }
    }

    return {
      template_sub_location_id: String(row?.template_sub_location_id || "").trim(),
      enabled,
      checked: enabled,
    };
  });

  const dimensionsResult = await replaceAntojadosCheckedDimensionsCrud({
    instanceId: normalizedInstanceId,
    templateCode,
    scopeType,
    details: dimensionDetails,
  });

  const subDimensionsResult = await replaceAntojadosCheckedSubDimensionsCrud({
    instanceId: normalizedInstanceId,
    templateCode,
    scopeType,
    details: subDimensionDetails,
  });

  return {
    instance_id: normalizedInstanceId,
    applied_toggles: toggles.length,
    skipped_workspace_governed_toggles: skippedWorkspaceGoverned.length,
    skipped_workspace_governed_items: skippedWorkspaceGoverned,
    dimensions_replaced: Number(dimensionsResult?.replaced || 0),
    sub_dimensions_replaced: Number(subDimensionsResult?.replaced || 0),
    scope_type: scopeType || null,
    template_code: templateCode || null,
  };
}

export async function registerAntojadosModuleOperationService({
  instanceId,
  requestId,
  operationBy,
  operationAt,
  operation,
}) {
  const normalizedInstanceId = String(instanceId || "").trim();
  const normalizedRequestId = String(requestId || "").trim();

  if (!normalizedInstanceId) {
    throw new Error("registerAntojadosModuleOperationService: instanceId requerido");
  }
  if (!normalizedRequestId) {
    throw new Error("registerAntojadosModuleOperationService: requestId requerido");
  }

  const instance = await getAntojadosInstanceService(normalizedInstanceId);
  if (!instance) {
    throw new Error("registerAntojadosModuleOperationService: instance not found");
  }
  if (instance.instance_type !== INSTANCE_TYPE.SPONSOR) {
    throw new Error("registerAntojadosModuleOperationService: solo aplica a instancias sponsor");
  }
  if (!isRegistroCorpSponsorApproved(instance.status)) {
    throw new Error("registerAntojadosModuleOperationService: bloqueado, instancia sponsor no aprobada por REGISTRO_CORP");
  }

  const payload = {
    instance_id: normalizedInstanceId,
    request_id: normalizedRequestId,
    operation_by: String(operationBy || "").trim(),
    operation_at: String(operationAt || new Date().toISOString()).trim(),
    operation,
  };

  if (!payload.operation_by) {
    throw new Error("registerAntojadosModuleOperationService: operationBy requerido");
  }
  if (!payload.operation || typeof payload.operation !== "object") {
    throw new Error("registerAntojadosModuleOperationService: operation requerido");
  }
  if (!Array.isArray(payload.operation.items) || payload.operation.items.length === 0) {
    throw new Error("registerAntojadosModuleOperationService: operation.items debe contener al menos un elemento");
  }

  const contractHash = hashPayload({
    instance_id: payload.instance_id,
    operation_by: payload.operation_by,
    operation_at: payload.operation_at,
    operation: payload.operation,
  });

  const persisted = await registerAntojadosSignedContractCrud({
    instanceId: normalizedInstanceId,
    requestId: normalizedRequestId,
    signedBy: payload.operation_by,
    signedAt: payload.operation_at,
    contract: payload.operation,
    signature: null,
    contractHash,
  });

  // Conectar checked items firmados → toggles existentes de cascada
  // No rematerializa — solo toca los nodos afectados y registra antes/después
  let diffResult = null;
  let notificationState = persisted.row.notification_state;
  if (!persisted.replayed) {
    diffResult = await applyAntojadosSponsorContractDiffCrud(normalizedInstanceId, normalizedRequestId);
    try {
      await notifyModuleOperationResult(
        normalizedInstanceId,
        normalizedRequestId,
        diffResult?.activation_state ?? persisted.row.activation_state,
      );
      await setContractNotificationState(normalizedInstanceId, normalizedRequestId, "activation_sent");
      notificationState = "activation_sent";
    } catch (notificationError) {
      await setContractNotificationState(normalizedInstanceId, normalizedRequestId, "activation_error");
      notificationState = "activation_error";
      diffResult = {
        ...(diffResult || {}),
        notification_error: notificationError.message,
      };
    }
  }

  return {
    ok: true,
    instance_id: persisted.row.instance_id,
    request_id: persisted.row.request_id,
    operation_by: persisted.row.signed_by,
    operation_at: persisted.row.signed_at,
    contract_hash: persisted.row.contract_hash,
    operation_state: persisted.row.lifecycle_state,
    activation_state: diffResult?.activation_state ?? persisted.row.activation_state,
    notification_target: persisted.row.notification_target,
    notification_state: notificationState,
    activation: diffResult ?? null,
    replayed: persisted.replayed === true,
  };
}

export async function listAntojadosModuleOperationsService(instanceId) {
  const normalizedInstanceId = String(instanceId || "").trim();
  if (!normalizedInstanceId) {
    throw new Error("listAntojadosModuleOperationsService: instanceId requerido");
  }

  const rows = await listAntojadosSignedContractsCrud(normalizedInstanceId);
  const normalizedRows = rows.map((row) => ({
    ...row,
    operation_by: row.signed_by,
    operation_at: row.signed_at,
    operation_state: row.lifecycle_state,
  }));

  return {
    ok: true,
    instance_id: normalizedInstanceId,
    rows: normalizedRows,
  };
}

export async function getAntojadosModulesCatalogService(instanceId) {
  const normalizedInstanceId = String(instanceId || "").trim();
  if (!normalizedInstanceId) {
    throw new Error("getAntojadosModulesCatalogService: instanceId requerido");
  }

  const instance = await getAntojadosInstanceService(normalizedInstanceId);
  if (!instance) {
    throw new Error("getAntojadosModulesCatalogService: instance not found");
  }
  if (instance.instance_type !== INSTANCE_TYPE.SPONSOR) {
    throw new Error("getAntojadosModulesCatalogService: solo aplica a instancias sponsor");
  }

  const buildCatalogRows = (inputCascade) => {
    const rowsByModule = new Map();
    for (const location of inputCascade?.dimension_locations || []) {
      const nodeKind = String(location?.node_kind || "").trim().toUpperCase();
      const componentCode = String(location?.component_code || "").trim();
      const locationId = String(location?.location_id || "").trim();
      if (nodeKind !== "COMPONENT" || !componentCode || !locationId) continue;

      const meta = parseMetaJson(location?.meta_json);
      const moduleDef = resolveCatalogModuleDefinition(location, meta);
      if (!moduleDef) continue;
      if (rowsByModule.has(moduleDef.itemCode)) continue;

      const required = moduleDef.required || toBoolean(meta.contract_required ?? meta.required);
      const plazoOptions = normalizePlazoOptions(
        meta.contract_plazo_options ?? meta.plazo_options,
        required,
      );
      const defaultPlazo = normalizePlazo(meta.contract_default_plazo ?? meta.default_plazo)
        || (required ? "12" : plazoOptions[0]);

      rowsByModule.set(moduleDef.itemCode, {
        item_code: moduleDef.itemCode,
        governance_source: isWorkspaceGovernedModuleCode(moduleDef.itemCode) ? "WORKSPACE" : "MODULES",
        can_toggle_in_modules: !isWorkspaceGovernedModuleCode(moduleDef.itemCode),
        source_component_code: componentCode,
        source_sub_code: null,
        location_id: locationId,
        sub_location_id: null,
        label: moduleDef.label,
        description: String(meta.contract_description || meta.description || location?.label || moduleDef.label).trim(),
        required,
        default_active: required ? true : toBoolean(location?.enabled),
        requested_visible: toBoolean(location?.visible),
        requested_enabled: toBoolean(location?.enabled),
        default_plazo: defaultPlazo,
        plazo_options: plazoOptions,
        module_code: moduleDef.itemCode,
        area_code: location?.area_code || null,
        sort_order: moduleDef.sortOrder,
      });
    }

    return Array.from(rowsByModule.values());
  };

  let cascade = await getAntojadosInstanceCascadeCrud(normalizedInstanceId);
  if (!cascade) {
    throw new Error(`getAntojadosModulesCatalogService: instancia ${normalizedInstanceId} no existe o no tiene cascada`);
  }

  let rows = buildCatalogRows(cascade);

  // Auto-heal for newly created sponsor instances that still have no materialized cascade.
  if (rows.length === 0) {
    await materializeAntojadosSponsorCascadeCrud(normalizedInstanceId);
    cascade = await getAntojadosInstanceCascadeCrud(normalizedInstanceId);
    rows = buildCatalogRows(cascade);
  }

  rows.sort((a, b) => a.sort_order - b.sort_order || a.item_code.localeCompare(b.item_code));

  return {
    ok: true,
    instance_id: normalizedInstanceId,
    rows,
  };
}

/**
 * Auditoría: compara los checked items del contrato más reciente de la instancia
 * contra el estado real de la cascada (sys_dimension_location_checked).
 * Devuelve una lista por componente con: item_code, checked, apply_state,
 * cascade_enabled, cascade_visible, diff (true si difieren).
 */
export async function getAntojadosModulesAuditService(instanceId) {
  const normalizedInstanceId = String(instanceId || "").trim();
  if (!normalizedInstanceId) {
    throw new Error("getAntojadosModulesAuditService: instanceId requerido");
  }

  const { request_id, items } = await getAntojadosSponsorContractLatestItemsCrud(normalizedInstanceId);

  if (!request_id) {
    return { instance_id: normalizedInstanceId, request_id: null, rows: [] };
  }

  // Cascada vigente indexada por IDs reales de la cascada
  const cascade = await getAntojadosInstanceCascadeCrud(normalizedInstanceId);
  if (!cascade) {
    throw new Error(`getAntojadosModulesAuditService: instancia ${normalizedInstanceId} no existe o no tiene cascada`);
  }
  const cascadeByLocationId = new Map();
  for (const dl of cascade.dimension_locations) {
    if (dl.location_id) {
      cascadeByLocationId.set(String(dl.location_id).trim(), dl);
    }
  }

  const rows = items.map((item) => {
    const targetId = String(item.location_id || item.sub_location_id || "").trim();
    const cascadeRow = targetId ? cascadeByLocationId.get(targetId) : null;
    const cascadeEnabled = cascadeRow != null ? (cascadeRow.enabled ? true : false) : null;
    const cascadeVisible = cascadeRow != null ? (cascadeRow.visible ? true : false) : null;
    const intendedEnabled = item.requested_enabled == null ? (item.checked ? true : false) : Boolean(item.requested_enabled);
    const intendedVisible = item.requested_visible == null ? null : Boolean(item.requested_visible);
    const diff = (cascadeEnabled !== null && cascadeEnabled !== intendedEnabled)
      || (intendedVisible !== null && cascadeVisible !== null && cascadeVisible !== intendedVisible);

    return {
      item_code: item.item_code,
      location_id: item.location_id,
      sub_location_id: item.sub_location_id,
      source_component_code: item.source_component_code,
      source_sub_code: item.source_sub_code,
      checked: item.checked ? true : false,
      requested_visible: intendedVisible,
      requested_enabled: intendedEnabled,
      date_inicia: item.date_inicia,
      date_termina: item.date_termina,
      apply_state: item.apply_state,
      applied_at: item.applied_at,
      cascade_enabled: cascadeEnabled,
      cascade_visible: cascadeVisible,
      diff,
    };
  });

  return { instance_id: normalizedInstanceId, request_id, rows };
}

/**
 * Revierte la cascada de un contrato que venció sin renovación.
 * Deshabilita los nodos que activó y marca el contrato como expired.
 */
export async function revertAntojadosModuleOperationService(instanceId, requestId) {
  const normalizedInstanceId = String(instanceId || "").trim();
  const normalizedRequestId  = String(requestId  || "").trim();
  if (!normalizedInstanceId || !normalizedRequestId) {
    throw new Error("revertAntojadosModuleOperationService: instanceId y requestId requeridos");
  }
  const result = await revertAntojadosSponsorContractCrud(normalizedInstanceId, normalizedRequestId);
  try {
    await notifyModuleRevert(normalizedInstanceId, normalizedRequestId);
    await setContractNotificationState(normalizedInstanceId, normalizedRequestId, "revert_sent");
  } catch (notificationError) {
    await setContractNotificationState(normalizedInstanceId, normalizedRequestId, "revert_error");
    return {
      ok: true,
      instance_id: normalizedInstanceId,
      request_id: normalizedRequestId,
      ...result,
      notification_state: "revert_error",
      notification_error: notificationError.message,
    };
  }
  return {
    ok: true,
    instance_id: normalizedInstanceId,
    request_id: normalizedRequestId,
    ...result,
    notification_state: "revert_sent",
  };
}

/**
 * Monitor de plazos: devuelve contratos que vencen pronto (warn) y contratos ya vencidos.
 * El caller (cron o endpoint Corp) usa esta info para notificar y/o disparar revert.
 */
export async function monitorAntojadosModulesExpiryService({ warningDays = 7 } = {}) {
  const { contracts_expired, contracts_expiring } = await getAntojadosExpiringContractsCrud({ warningDays });

  // Auto-revertir los que ya expiraron
  const revertResults = [];
  for (const contract of contracts_expired) {
    const result = await revertAntojadosSponsorContractCrud(contract.instance_id, contract.request_id);
    try {
      await notifyModuleRevert(contract.instance_id, contract.request_id);
      await setContractNotificationState(contract.instance_id, contract.request_id, "revert_sent");
      revertResults.push({ instance_id: contract.instance_id, request_id: contract.request_id, ...result, notification_state: "revert_sent" });
    } catch (notificationError) {
      await setContractNotificationState(contract.instance_id, contract.request_id, "revert_error");
      revertResults.push({
        instance_id: contract.instance_id,
        request_id: contract.request_id,
        ...result,
        notification_state: "revert_error",
        notification_error: notificationError.message,
      });
    }
  }

  const expiringSoon = [];
  for (const contract of contracts_expiring) {
    const validUntil = contract.valid_until ? new Date(contract.valid_until).toISOString() : null;
    let notificationState = contract.notification_state;
    let notificationError = null;

    if (!["expiry_sent", "revert_sent"].includes(String(contract.notification_state || "").trim())) {
      try {
        await notifyModuleExpiryWarning(contract.instance_id, contract.request_id, validUntil || "sin fecha");
        notificationState = "expiry_sent";
        await setContractNotificationState(contract.instance_id, contract.request_id, notificationState);
      } catch (error) {
        notificationState = "expiry_error";
        notificationError = error.message;
        await setContractNotificationState(contract.instance_id, contract.request_id, notificationState);
      }
    }

    expiringSoon.push({
      instance_id: contract.instance_id,
      request_id: contract.request_id,
      valid_until: contract.valid_until,
      notification_target: contract.notification_target,
      notification_state: notificationState,
      notification_error: notificationError,
    });
  }

  return {
    ok: true,
    auto_reverted: revertResults,
    expiring_soon: expiringSoon,
  };
}

/**
 * Marca que se envió notificación de expiración para un contrato específico.
 */
export async function markAntojadosModuleNotifiedService(instanceId, requestId, notificationState) {
  const normalizedInstanceId = String(instanceId || "").trim();
  const normalizedRequestId  = String(requestId  || "").trim();
  if (!normalizedInstanceId || !normalizedRequestId) {
    throw new Error("markAntojadosContractNotifiedService: instanceId y requestId requeridos");
  }
  await markAntojadosContractNotifiedCrud(normalizedInstanceId, normalizedRequestId, notificationState);
  return { ok: true };
}

export async function deleteAntojadosDimensionService(code) {
  await deleteAntojadosDimensionCrud(code);
  return { deleted: true, dimension_code: code };
}

export async function deleteAntojadosSubDimensionService(code) {
  await deleteAntojadosSubDimensionCrud(code);
  return { deleted: true, sub_code: code };
}

export async function runAntojadosScannerSnapshotService(payload = {}) {
  const response = await fetch(
    `${config.antojadosApiBaseUrl}/antojados/gt/scanner/snapshot`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {}),
    },
  );

  const data = await response.json().catch(() => ({
    ok: false,
    error: "Invalid upstream response",
  }));

  if (!response.ok) {
    const message = data?.error || `Upstream scanner snapshot failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export async function saveAntojadosScannerSelectionService(payload = {}) {
  const response = await fetch(
    `${config.antojadosApiBaseUrl}/antojados/gt/scanner/save`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {}),
    },
  );

  const data = await response.json().catch(() => ({
    ok: false,
    error: "Invalid upstream response",
  }));

  if (!response.ok) {
    const message = data?.error || `Upstream scanner save failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export async function listAntojadosTenantExpedienteService(
  tenantId,
  { reviewStatus = null, page = 1, limit = 50 } = {},
) {
  const normalizedTenantId = String(tenantId || "").trim();
  if (!normalizedTenantId) {
    throw new Error("listAntojadosTenantExpedienteService: tenantId requerido");
  }

  const query = new URLSearchParams();
  if (reviewStatus) query.set("review_status", String(reviewStatus));
  query.set("page", String(page));
  query.set("limit", String(limit));

  const response = await fetch(
    `${config.antojadosApiBaseUrl}/antojados/gt/tenants/${encodeURIComponent(normalizedTenantId)}/expediente?${query.toString()}`,
  );

  const data = await response.json().catch(() => ({
    ok: false,
    error: "Invalid upstream response",
  }));

  if (!response.ok) {
    const message = data?.error || `Upstream expediente failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export async function listAntojadosInstanceExpedienteService(
  instanceId,
  options = {},
) {
  const normalizedInstanceId = String(instanceId || "").trim();
  if (!normalizedInstanceId) {
    throw new Error("listAntojadosInstanceExpedienteService: instanceId requerido");
  }

  const instance = await getAntojadosInstanceService(normalizedInstanceId);
  const tenantId = String(instance?.tenant_id || "").trim();
  if (!tenantId) {
    throw new Error("listAntojadosInstanceExpedienteService: tenant_id no disponible para la instancia");
  }

  const data = await listAntojadosTenantExpedienteService(tenantId, options);
  return {
    ...data,
    instance_id: normalizedInstanceId,
  };
}

export async function reviewAntojadosTenantExpedienteDocumentService(
  tenantId,
  documentId,
  payload,
) {
  const normalizedTenantId = String(tenantId || "").trim();
  const normalizedDocumentId = String(documentId || "").trim();
  if (!normalizedTenantId) {
    throw new Error("reviewAntojadosTenantExpedienteDocumentService: tenantId requerido");
  }
  if (!normalizedDocumentId) {
    throw new Error("reviewAntojadosTenantExpedienteDocumentService: documentId requerido");
  }

  const response = await fetch(
    `${config.antojadosApiBaseUrl}/antojados/gt/tenants/${encodeURIComponent(normalizedTenantId)}/expediente/${encodeURIComponent(normalizedDocumentId)}/review`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {}),
    },
  );

  const data = await response.json().catch(() => ({
    ok: false,
    error: "Invalid upstream response",
  }));

  if (!response.ok) {
    const message = data?.error || `Upstream review failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export async function reviewAntojadosInstanceExpedienteDocumentService(
  instanceId,
  documentId,
  payload,
) {
  const normalizedInstanceId = String(instanceId || "").trim();
  if (!normalizedInstanceId) {
    throw new Error("reviewAntojadosInstanceExpedienteDocumentService: instanceId requerido");
  }

  const instance = await getAntojadosInstanceService(normalizedInstanceId);
  const tenantId = String(instance?.tenant_id || "").trim();
  if (!tenantId) {
    throw new Error("reviewAntojadosInstanceExpedienteDocumentService: tenant_id no disponible para la instancia");
  }

  const data = await reviewAntojadosTenantExpedienteDocumentService(
    tenantId,
    documentId,
    payload,
  );

  return {
    ...data,
    instance_id: normalizedInstanceId,
  };
}

function extractExpedienteRows(raw) {
  if (Array.isArray(raw?.data?.data)) return raw.data.data;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.rows)) return raw.rows;
  return [];
}

export async function getAntojadosRegistroCorpReadinessService(instanceId) {
  const normalizedInstanceId = String(instanceId || "").trim();
  if (!normalizedInstanceId) {
    throw new Error("getAntojadosRegistroCorpReadinessService: instanceId requerido");
  }

  const instance = await getAntojadosInstanceService(normalizedInstanceId);
  if (!instance) {
    throw new Error("getAntojadosRegistroCorpReadinessService: instance not found");
  }
  if (String(instance.instance_type || "").toLowerCase() !== INSTANCE_TYPE.SPONSOR) {
    throw new Error("getAntojadosRegistroCorpReadinessService: solo aplica a instancias sponsor");
  }

  const cascade = await getAntojadosInstanceCascadeService(normalizedInstanceId);
  const dimensionLocations = Array.isArray(cascade?.dimension_locations)
    ? cascade.dimension_locations
    : [];
  const subDimensionLocations = Array.isArray(cascade?.sub_dimension_locations)
    ? cascade.sub_dimension_locations
    : [];

  const hasConfiguracion = dimensionLocations.length > 0 && subDimensionLocations.length > 0;
  const modulosEnabledCount = dimensionLocations.filter((row) => row?.enabled === true).length;
  const equipoReady = String(instance?.representative_tenant_user_id || "").trim().length > 0;

  const tenantId = String(instance.tenant_id || "").trim();
  const expedienteRaw = tenantId
    ? await listAntojadosTenantExpedienteService(tenantId, { page: 1, limit: 500 })
    : null;
  const expedienteRows = extractExpedienteRows(expedienteRaw);

  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  for (const row of expedienteRows) {
    const status = String(row?.review_status || "").trim().toLowerCase();
    if (status === "approved") approvedCount += 1;
    else if (status === "rejected") rejectedCount += 1;
    else pendingCount += 1;
  }

  const blockedReasons = [];
  const modulosReady = hasConfiguracion && modulosEnabledCount > 0;
  const registroReady = expedienteRows.length > 0;
  const registroCorpReady = expedienteRows.length > 0 && pendingCount === 0 && approvedCount > 0;

  if (!hasConfiguracion) {
    blockedReasons.push("CONFIGURACION no tiene cascada materializada (dimension/sub-dimension)");
  }
  if (!modulosReady) {
    blockedReasons.push("MODULOS no tiene componentes habilitados en Locations Sponsor");
  }
  if (!equipoReady) {
    blockedReasons.push("EQUIPO sin representante asignado en la instancia sponsor");
  }
  if (!registroReady) {
    blockedReasons.push("REGISTRO no ha entregado expediente");
  }
  if (registroReady && !registroCorpReady) {
    blockedReasons.push("REGISTRO_CORP pendiente: faltan aprobaciones o hay expediente en revision");
  }

  const stageDetails = [
    { key: "configuracion_ready", label: "Configuracion", ready: hasConfiguracion },
    { key: "modulos_ready", label: "Modulos", ready: modulosReady },
    { key: "equipo_ready", label: "Equipo", ready: equipoReady },
    { key: "registro_ready", label: "Registro", ready: registroReady },
    { key: "registro_corp_ready", label: "Registro Corp", ready: registroCorpReady },
  ];

  return {
    ok: true,
    instance_id: normalizedInstanceId,
    instance_status: String(instance.status || ""),
    stages: {
      configuracion_ready: hasConfiguracion,
      modulos_ready: modulosReady,
      equipo_ready: equipoReady,
      registro_ready: registroReady,
      registro_corp_ready: registroCorpReady,
    },
    stage_details: stageDetails,
    counts: {
      dimension_locations: dimensionLocations.length,
      sub_dimension_locations: subDimensionLocations.length,
      modulos_enabled: modulosEnabledCount,
      expediente_total: expedienteRows.length,
      expediente_pending: pendingCount,
      expediente_approved: approvedCount,
      expediente_rejected: rejectedCount,
    },
    blocked_reasons: blockedReasons,
  };
}

async function assertRegistroCorpSponsorInstance(instanceId, origin) {
  const normalizedInstanceId = String(instanceId || "").trim();
  if (!normalizedInstanceId) {
    throw new Error(`${origin}: instanceId requerido`);
  }

  const instance = await getAntojadosInstanceService(normalizedInstanceId);
  if (!instance) {
    throw new Error(`${origin}: instance not found`);
  }
  if (String(instance.instance_type || "").toLowerCase() !== INSTANCE_TYPE.SPONSOR) {
    throw new Error(`${origin}: solo aplica a instancias sponsor`);
  }

  return {
    normalizedInstanceId,
    instance,
  };
}

export async function getOrCreateAntojadosRegistroCorpVerificationService(instanceId, {
  actor_tenant_user_id = null,
  request_id = null,
  correlation_id = null,
} = {}) {
  const { normalizedInstanceId } = await assertRegistroCorpSponsorInstance(
    instanceId,
    "getOrCreateAntojadosRegistroCorpVerificationService",
  );

  const header = await getOrCreateAntojadosRegistroCorpVerificationCrud(normalizedInstanceId, {
    actorTenantUserId: actor_tenant_user_id,
    requestId: request_id,
    correlationId: correlation_id,
  });

  return {
    ok: true,
    instance_id: normalizedInstanceId,
    header,
  };
}

export async function listAntojadosRegistroCorpVerificationChecksService(instanceId, verificationId) {
  const { normalizedInstanceId } = await assertRegistroCorpSponsorInstance(
    instanceId,
    "listAntojadosRegistroCorpVerificationChecksService",
  );

  const rows = await listAntojadosRegistroCorpVerificationChecksCrud(
    normalizedInstanceId,
    verificationId,
  );

  return {
    ok: true,
    instance_id: normalizedInstanceId,
    verification_id: String(verificationId || "").trim(),
    rows,
  };
}

export async function upsertAntojadosRegistroCorpVerificationCheckService(instanceId, verificationId, {
  check_code,
  check_state,
  actor_tenant_user_id = null,
  note = null,
  evidence_ref = null,
  evidence_json = null,
  check_required = true,
} = {}) {
  const { normalizedInstanceId } = await assertRegistroCorpSponsorInstance(
    instanceId,
    "upsertAntojadosRegistroCorpVerificationCheckService",
  );

  const header = await upsertAntojadosRegistroCorpVerificationCheckCrud(
    normalizedInstanceId,
    verificationId,
    {
      checkCode: check_code,
      checkState: check_state,
      actorTenantUserId: actor_tenant_user_id,
      note,
      evidenceRef: evidence_ref,
      evidenceJson: evidence_json,
      checkRequired: check_required,
    },
  );

  const rows = await listAntojadosRegistroCorpVerificationChecksCrud(
    normalizedInstanceId,
    verificationId,
  );

  return {
    ok: true,
    instance_id: normalizedInstanceId,
    verification_id: String(verificationId || "").trim(),
    header,
    rows,
  };
}

export async function decideAntojadosRegistroCorpVerificationService(instanceId, verificationId, {
  decision_state,
  decided_by_tenant_user_id,
  decision_note = null,
  request_id = null,
  correlation_id = null,
} = {}) {
  const { normalizedInstanceId } = await assertRegistroCorpSponsorInstance(
    instanceId,
    "decideAntojadosRegistroCorpVerificationService",
  );

  const decision = await decideAntojadosRegistroCorpVerificationCrud(
    normalizedInstanceId,
    verificationId,
    {
      decisionState: decision_state,
      decidedByTenantUserId: decided_by_tenant_user_id,
      decisionNote: decision_note,
      requestId: request_id,
      correlationId: correlation_id,
    },
  );

  const rows = await listAntojadosRegistroCorpVerificationChecksCrud(
    normalizedInstanceId,
    verificationId,
  );

  return {
    ok: true,
    instance_id: normalizedInstanceId,
    verification_id: String(verificationId || "").trim(),
    decision,
    rows,
  };
}