import crypto from "node:crypto";
import { getAntojadosPool, sqlType } from "../../db/sql.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function parseDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function hashActivationToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export async function createElectronicSignatureCrud({
  instanceId,
  representativeTenantUserId,
  createdByTenantUserId,
  requestId,
}) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizeText(instanceId))
    .input("representative_tenant_user_id", sql.NVarChar(64), normalizeText(representativeTenantUserId))
    .input("created_by_tenant_user_id", sql.NVarChar(64), normalizeText(createdByTenantUserId) || null)
    .input("request_id", sql.NVarChar(120), normalizeText(requestId) || null)
    .execute("antojados_core.sp_sys_electronic_signature_create_for_instance");

  return result.recordset?.[0] || null;
}

export async function sendElectronicSignatureActivationCrud({
  instanceId,
  actorTenantUserId,
  notifiedTenantUserId,
  tokenHash,
  expiresAt,
  channel,
  correlationId,
  requestId,
}) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizeText(instanceId))
    .input("actor_tenant_user_id", sql.NVarChar(64), normalizeText(actorTenantUserId))
    .input("notified_tenant_user_id", sql.NVarChar(64), normalizeText(notifiedTenantUserId) || null)
    .input("token_hash", sql.NVarChar(256), normalizeText(tokenHash))
    .input("expires_at", sql.DateTime2(7), parseDateOrNull(expiresAt))
    .input("channel", sql.NVarChar(40), normalizeText(channel) || "in_app")
    .input("correlation_id", sql.NVarChar(120), normalizeText(correlationId) || null)
    .input("request_id", sql.NVarChar(120), normalizeText(requestId) || null)
    .execute("antojados_core.sp_sys_electronic_signature_send_activation");

  return result.recordset?.[0] || null;
}

export async function acceptElectronicSignatureActivationCrud({
  instanceId,
  activationId,
  actorTenantUserId,
  credentialValidated,
  correlationId,
  requestId,
}) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizeText(instanceId))
    .input("activation_id", sql.NVarChar(64), normalizeText(activationId))
    .input("actor_tenant_user_id", sql.NVarChar(64), normalizeText(actorTenantUserId))
    .input("credential_validated", sql.Bit, credentialValidated ? 1 : 0)
    .input("correlation_id", sql.NVarChar(120), normalizeText(correlationId) || null)
    .input("request_id", sql.NVarChar(120), normalizeText(requestId) || null)
    .execute("antojados_core.sp_sys_electronic_signature_accept_activation");

  return result.recordset?.[0] || null;
}

export async function authorizeElectronicSignatureActionCrud({
  instanceId,
  requestedByTenantUserId,
  actionCode,
  resourceType,
  resourceId,
  operationId,
  credentialValidated,
  expiresAt,
  correlationId,
  requestId,
}) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizeText(instanceId))
    .input("requested_by_tenant_user_id", sql.NVarChar(64), normalizeText(requestedByTenantUserId))
    .input("action_code", sql.NVarChar(120), normalizeText(actionCode))
    .input("resource_type", sql.NVarChar(80), normalizeText(resourceType))
    .input("resource_id", sql.NVarChar(128), normalizeText(resourceId))
    .input("operation_id", sql.NVarChar(120), normalizeText(operationId) || null)
    .input("credential_validated", sql.Bit, credentialValidated ? 1 : 0)
    .input("expires_at", sql.DateTime2(7), parseDateOrNull(expiresAt))
    .input("correlation_id", sql.NVarChar(120), normalizeText(correlationId) || null)
    .input("request_id", sql.NVarChar(120), normalizeText(requestId) || null)
    .execute("antojados_core.sp_sys_electronic_signature_authorize_action");

  return result.recordset?.[0] || null;
}

export async function getElectronicSignatureStatusCrud(instanceId) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizeText(instanceId))
    .execute("antojados_core.sp_sys_electronic_signature_get_status");

  const signature = result.recordsets?.[0]?.[0] || null;
  const lastActivation = result.recordsets?.[1]?.[0] || null;

  return {
    signature,
    lastActivation,
  };
}
