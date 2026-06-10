import crypto from "node:crypto";
import {
  acceptElectronicSignatureActivationCrud,
  authorizeElectronicSignatureActionCrud,
  createElectronicSignatureCrud,
  getElectronicSignatureStatusCrud,
  hashActivationToken,
  sendElectronicSignatureActivationCrud,
} from "../../infra/dorado/efirmaCrudDorado.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function ensureRequired(value, fieldName) {
  const text = normalizeText(value);
  if (!text) {
    throw new Error(`efirmaResolver: ${fieldName} requerido`);
  }
  return text;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeIsoDate(value, fallbackDate) {
  if (!value && fallbackDate) return fallbackDate.toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("efirmaResolver: fecha invalida");
  return date.toISOString();
}

function createDefaultActivationToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function createElectronicSignatureResolver(payload = {}) {
  return createElectronicSignatureCrud({
    instanceId: ensureRequired(payload.instance_id, "instance_id"),
    representativeTenantUserId: ensureRequired(payload.representative_tenant_user_id, "representative_tenant_user_id"),
    createdByTenantUserId: normalizeText(payload.created_by_tenant_user_id) || null,
    requestId: normalizeText(payload.request_id) || null,
  });
}

export async function sendElectronicSignatureActivationResolver(payload = {}) {
  const now = new Date();
  const defaultExpiry = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  const activationToken = normalizeText(payload.activation_token) || createDefaultActivationToken();
  const tokenHash = normalizeText(payload.token_hash) || hashActivationToken(activationToken);

  const row = await sendElectronicSignatureActivationCrud({
    instanceId: ensureRequired(payload.instance_id, "instance_id"),
    actorTenantUserId: ensureRequired(payload.actor_tenant_user_id, "actor_tenant_user_id"),
    notifiedTenantUserId: normalizeText(payload.notified_tenant_user_id) || null,
    tokenHash,
    expiresAt: normalizeIsoDate(payload.expires_at, defaultExpiry),
    channel: normalizeText(payload.channel) || "in_app",
    correlationId: normalizeText(payload.correlation_id) || null,
    requestId: normalizeText(payload.request_id) || null,
  });

  return {
    row,
    activation_token: normalizeText(payload.activation_token) ? null : activationToken,
  };
}

export async function acceptElectronicSignatureActivationResolver(payload = {}) {
  return acceptElectronicSignatureActivationCrud({
    instanceId: ensureRequired(payload.instance_id, "instance_id"),
    activationId: ensureRequired(payload.activation_id, "activation_id"),
    actorTenantUserId: ensureRequired(payload.actor_tenant_user_id, "actor_tenant_user_id"),
    credentialValidated: normalizeBoolean(payload.credential_validated, false),
    correlationId: normalizeText(payload.correlation_id) || null,
    requestId: normalizeText(payload.request_id) || null,
  });
}

export async function authorizeElectronicSignatureActionResolver(payload = {}) {
  return authorizeElectronicSignatureActionCrud({
    instanceId: ensureRequired(payload.instance_id, "instance_id"),
    requestedByTenantUserId: ensureRequired(payload.requested_by_tenant_user_id, "requested_by_tenant_user_id"),
    actionCode: ensureRequired(payload.action_code, "action_code"),
    resourceType: ensureRequired(payload.resource_type, "resource_type"),
    resourceId: ensureRequired(payload.resource_id, "resource_id"),
    operationId: normalizeText(payload.operation_id) || null,
    credentialValidated: normalizeBoolean(payload.credential_validated, false),
    expiresAt: normalizeText(payload.expires_at) || null,
    correlationId: normalizeText(payload.correlation_id) || null,
    requestId: normalizeText(payload.request_id) || null,
  });
}

export async function getElectronicSignatureStatusResolver(instanceId) {
  return getElectronicSignatureStatusCrud(ensureRequired(instanceId, "instance_id"));
}
