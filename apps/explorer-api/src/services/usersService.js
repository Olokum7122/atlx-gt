import crypto from "node:crypto";
import {
  upsertUserFromAuthCrud,
  getUserCrud,
  listUsersByTenantCrud,
} from "../infra/dorado/usersCrudDorado.js";
import { mapUser, mapUserList } from "../domain/explorerContracts.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTraceIds(payload = {}) {
  const requestId = normalizeText(payload.request_id) || crypto.randomUUID();
  const correlationId = normalizeText(payload.correlation_id) || crypto.randomUUID();
  return { requestId, correlationId };
}

export async function upsertUserFromAuthService(payload) {
  const trace = normalizeTraceIds(payload);

  const row = await upsertUserFromAuthCrud({
    userId: payload.user_id,
    tenantId: payload.tenant_id,
    authProvider: payload.auth_provider,
    authSubject: payload.auth_subject,
    emailHash: payload.email_hash,
    displayName: payload.display_name,
    avatarUrl: payload.avatar_url,
    role: payload.role,
  });

  return {
    user: mapUser(row),
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  };
}

export async function getUserService(userId) {
  const row = await getUserCrud(userId);
  return { user: mapUser(row) };
}

export async function listUsersByTenantService(tenantId, status) {
  const rows = await listUsersByTenantCrud(tenantId, status);
  return { users: mapUserList(rows) };
}
