function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeDate(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

export function mapElectronicSignatureHeader(row) {
  if (!row) return null;
  return {
    signature_id: normalizeText(row.signature_id),
    instance_id: normalizeText(row.instance_id),
    representative_tenant_user_id: normalizeText(row.representative_tenant_user_id),
    lifecycle_state: normalizeText(row.lifecycle_state),
    activated_at: normalizeDate(row.activated_at),
    revoked_at: normalizeDate(row.revoked_at),
    updated_at: normalizeDate(row.updated_at),
  };
}

export function mapElectronicSignatureActivation(row) {
  if (!row) return null;
  return {
    activation_id: normalizeText(row.activation_id),
    signature_id: normalizeText(row.signature_id),
    instance_id: normalizeText(row.instance_id),
    activation_state: normalizeText(row.activation_state),
    channel: normalizeText(row.channel),
    expires_at: normalizeDate(row.expires_at),
    opened_at: normalizeDate(row.opened_at),
    accepted_at: normalizeDate(row.accepted_at),
    rejected_at: normalizeDate(row.rejected_at),
    created_at: normalizeDate(row.created_at),
  };
}

export function mapElectronicSignatureAuthorization(row) {
  if (!row) return null;
  return {
    authorization_id: normalizeText(row.authorization_id),
    signature_id: normalizeText(row.signature_id),
    instance_id: normalizeText(row.instance_id),
    requested_by_tenant_user_id: normalizeText(row.requested_by_tenant_user_id),
    operation_id: normalizeText(row.operation_id),
    action_code: normalizeText(row.action_code),
    resource_type: normalizeText(row.resource_type),
    resource_id: normalizeText(row.resource_id),
    authorization_state: normalizeText(row.authorization_state),
    authorized_at: normalizeDate(row.authorized_at),
    rejected_at: normalizeDate(row.rejected_at),
    expires_at: normalizeDate(row.expires_at),
    created_at: normalizeDate(row.created_at),
  };
}

export function mapElectronicSignatureStatus(payload = {}) {
  return {
    signature: mapElectronicSignatureHeader(payload.signature),
    last_activation: mapElectronicSignatureActivation(payload.lastActivation),
  };
}
