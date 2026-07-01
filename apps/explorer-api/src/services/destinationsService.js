import crypto from "node:crypto";
import {
  upsertDestinationCrud,
  listDestinationsCrud,
} from "../infra/dorado/destinationsCrudDorado.js";
import { getTenantCrud } from "../infra/dorado/tenantsCrudDorado.js";
import { mapDestination, mapDestinationList } from "../domain/explorerContracts.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTraceIds(payload = {}) {
  const requestId = normalizeText(payload.request_id) || crypto.randomUUID();
  const correlationId = normalizeText(payload.correlation_id) || crypto.randomUUID();
  return { requestId, correlationId };
}

export async function upsertDestinationService(payload) {
  const trace = normalizeTraceIds(payload);

  // Validar que el tenant existe
  const tenant = await getTenantCrud(payload.tenant_id);
  if (!tenant) {
    throw new Error(`upsertDestinationService: tenant ${payload.tenant_id} no encontrado`);
  }

  const row = await upsertDestinationCrud({
    destinationId: payload.destination_id,
    tenantId: payload.tenant_id,
    destinationType: payload.destination_type,
    displayName: payload.display_name,
    externalRef: payload.external_ref,
    settingsJson: payload.settings_json,
  });

  return {
    destination: mapDestination(row),
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  };
}

export async function listDestinationsService(tenantId, destinationType, status) {
  const rows = await listDestinationsCrud(tenantId, destinationType, status);
  return { destinations: mapDestinationList(rows) };
}
