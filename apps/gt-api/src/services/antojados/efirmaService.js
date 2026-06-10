import crypto from "node:crypto";
import {
  acceptElectronicSignatureActivationResolver,
  authorizeElectronicSignatureActionResolver,
  createElectronicSignatureResolver,
  getElectronicSignatureStatusResolver,
  sendElectronicSignatureActivationResolver,
} from "./efirmaResolver.js";
import {
  mapElectronicSignatureActivation,
  mapElectronicSignatureAuthorization,
  mapElectronicSignatureHeader,
  mapElectronicSignatureStatus,
} from "./efirmaMapper.js";
import { config } from "../../config.js";
import { getAntojadosInstanceCrud } from "../../infra/dorado/antojadosConfigCrudDorado.js";
import { INSTANCE_TYPE } from "../../domain/configuracion/antojadosInstanciasContracts.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTraceIds(payload = {}) {
  const requestId = normalizeText(payload.request_id) || crypto.randomUUID();
  const correlationId = normalizeText(payload.correlation_id) || crypto.randomUUID();
  return { requestId, correlationId };
}

function isActivatedStatus(statusPayload) {
  const lifecycleState = normalizeText(statusPayload?.signature?.lifecycle_state).toLowerCase();
  const activationState = normalizeText(statusPayload?.lastActivation?.activation_state).toLowerCase();
  return lifecycleState === "active" || activationState === "accepted";
}

function normalizeRegistroCorpSponsorStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (["approved", "active", "aprobado"].includes(normalized)) return "approved";
  return normalized;
}

function isRegistroCorpSponsorApproved(value) {
  return normalizeRegistroCorpSponsorStatus(value) === "approved";
}

async function assertRegistroCorpSponsorApprovedForEfirma(instanceId, origin) {
  const normalizedInstanceId = normalizeText(instanceId);
  if (!normalizedInstanceId) {
    throw new Error(`${origin}: instance_id requerido`);
  }

  const instance = await getAntojadosInstanceCrud(normalizedInstanceId);
  if (!instance) {
    throw new Error(`${origin}: instancia no encontrada`);
  }
  if (instance.instance_type !== INSTANCE_TYPE.SPONSOR) {
    throw new Error(`${origin}: solo aplica a instancias sponsor`);
  }
  if (!isRegistroCorpSponsorApproved(instance.status)) {
    throw new Error(`${origin}: bloqueado, instancia sponsor no aprobada por REGISTRO_CORP`);
  }

  return normalizedInstanceId;
}

async function notifyEfirmaDistribution(instanceId, signatureId, trace) {
  const response = await fetch(
    `${config.antojadosApiBaseUrl}/antojados/gt/instancias/${encodeURIComponent(instanceId)}/notifications`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        notification_type: "operational",
        title: "E_FIRMA activada disponible",
        message: `La firma ${signatureId} fue distribuida para consumo operativo de Contrato y Modulos.`,
        cta_label: "Ver estado de firma",
        cta_deeplink: "/mi-chamba/atencion",
        dismissable: true,
        request_id: trace.requestId,
        correlation_id: trace.correlationId,
      }),
    },
  );

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(`Notificacion E_FIRMA fallida (${response.status}): ${raw || "upstream error"}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

export async function createElectronicSignatureService(payload) {
  await assertRegistroCorpSponsorApprovedForEfirma(
    payload?.instance_id,
    "createElectronicSignatureService",
  );
  const trace = normalizeTraceIds(payload);
  const row = await createElectronicSignatureResolver({
    ...payload,
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  });
  return {
    row: mapElectronicSignatureHeader(row),
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  };
}

export async function sendElectronicSignatureActivationService(payload) {
  await assertRegistroCorpSponsorApprovedForEfirma(
    payload?.instance_id,
    "sendElectronicSignatureActivationService",
  );
  const trace = normalizeTraceIds(payload);
  const result = await sendElectronicSignatureActivationResolver({
    ...payload,
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  });
  return {
    activation: mapElectronicSignatureActivation(result.row),
    activation_token: result.activation_token,
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  };
}

export async function acceptElectronicSignatureActivationService(payload) {
  await assertRegistroCorpSponsorApprovedForEfirma(
    payload?.instance_id,
    "acceptElectronicSignatureActivationService",
  );
  const trace = normalizeTraceIds(payload);
  const row = await acceptElectronicSignatureActivationResolver({
    ...payload,
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  });
  return {
    activation: mapElectronicSignatureActivation(row),
    signature: mapElectronicSignatureHeader(row),
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  };
}

export async function authorizeElectronicSignatureActionService(payload) {
  await assertRegistroCorpSponsorApprovedForEfirma(
    payload?.instance_id,
    "authorizeElectronicSignatureActionService",
  );
  const trace = normalizeTraceIds(payload);
  const row = await authorizeElectronicSignatureActionResolver({
    ...payload,
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  });
  return {
    row: mapElectronicSignatureAuthorization(row),
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  };
}

export async function getElectronicSignatureStatusService(instanceId) {
  const payload = await getElectronicSignatureStatusResolver(instanceId);
  return mapElectronicSignatureStatus(payload);
}

export async function distributeElectronicSignatureOutputsService(payload = {}) {
  const instanceId = normalizeText(payload.instance_id);
  const actorTenantUserId = normalizeText(payload.actor_tenant_user_id);

  await assertRegistroCorpSponsorApprovedForEfirma(
    instanceId,
    "distributeElectronicSignatureOutputsService",
  );

  if (!instanceId) {
    throw new Error("distributeElectronicSignatureOutputsService: instance_id requerido");
  }
  if (!actorTenantUserId) {
    throw new Error("distributeElectronicSignatureOutputsService: actor_tenant_user_id requerido");
  }

  const trace = normalizeTraceIds(payload);
  const statusPayload = await getElectronicSignatureStatusResolver(instanceId);

  if (!statusPayload?.signature) {
    throw new Error("distributeElectronicSignatureOutputsService: no existe firma para la instancia");
  }
  if (!isActivatedStatus(statusPayload)) {
    throw new Error("distributeElectronicSignatureOutputsService: la firma aun no esta activa/aceptada");
  }

  const signature = mapElectronicSignatureHeader(statusPayload.signature);

  let contrato;
  try {
    const row = await authorizeElectronicSignatureActionResolver({
      instance_id: instanceId,
      requested_by_tenant_user_id: actorTenantUserId,
      action_code: "CONTRATO_SIGN_VALIDATION",
      resource_type: "CONTRATO",
      resource_id: normalizeText(payload.contract_resource_id) || instanceId,
      credential_validated: true,
      correlation_id: trace.correlationId,
      request_id: `${trace.requestId}:contrato`,
    });
    contrato = {
      receiver: "CONTRATO",
      delivery_state: "delivered",
      authorization: mapElectronicSignatureAuthorization(row),
    };
  } catch (error) {
    contrato = {
      receiver: "CONTRATO",
      delivery_state: "error",
      error: error.message,
    };
  }

  let modulos;
  try {
    const row = await authorizeElectronicSignatureActionResolver({
      instance_id: instanceId,
      requested_by_tenant_user_id: actorTenantUserId,
      action_code: "MODULOS_SIGN_VALIDATION",
      resource_type: "MODULOS",
      resource_id: normalizeText(payload.modules_resource_id) || instanceId,
      credential_validated: true,
      correlation_id: trace.correlationId,
      request_id: `${trace.requestId}:modulos`,
    });
    modulos = {
      receiver: "MODULOS",
      delivery_state: "delivered",
      authorization: mapElectronicSignatureAuthorization(row),
    };
  } catch (error) {
    modulos = {
      receiver: "MODULOS",
      delivery_state: "error",
      error: error.message,
    };
  }

  let efirmaAntojados;
  try {
    await notifyEfirmaDistribution(instanceId, signature.signature_id || "N/A", trace);
    efirmaAntojados = {
      receiver: "E_FIRMA_ANTOJADOS",
      delivery_state: "delivered",
    };
  } catch (error) {
    efirmaAntojados = {
      receiver: "E_FIRMA_ANTOJADOS",
      delivery_state: "error",
      error: error.message,
    };
  }

  const receivers = [efirmaAntojados, contrato, modulos];
  const distributed = receivers.every((item) => item.delivery_state === "delivered");

  return {
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
    instance_id: instanceId,
    signature,
    distributed,
    receivers,
  };
}
