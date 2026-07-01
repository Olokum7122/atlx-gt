import { getExplorerPool, sqlType } from "../../db/sql.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeJson(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Crea o actualiza un destino.
 * SP: explorer_core.usp_destination_upsert
 */
export async function upsertDestinationCrud({
  destinationId,
  tenantId,
  destinationType,
  displayName,
  externalRef,
  settingsJson,
}) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("destination_id", sql.VarChar(50), normalizeText(destinationId))
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .input("destination_type", sql.VarChar(50), normalizeText(destinationType))
    .input("display_name", sql.NVarChar(255), normalizeText(displayName) || null)
    .input("external_ref", sql.NVarChar(500), normalizeText(externalRef) || null)
    .input("settings_json", sql.NVarChar(sql.MAX), normalizeJson(settingsJson) || null)
    .execute("explorer_core.usp_destination_upsert");

  return result.recordset?.[0] || null;
}

/**
 * Lista destinos por tenant.
 * SP: explorer_core.usp_destination_list
 */
export async function listDestinationsCrud(tenantId, destinationType, status) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .input("destination_type", sql.VarChar(50), normalizeText(destinationType) || null)
    .input("status", sql.VarChar(20), normalizeText(status) || null)
    .execute("explorer_core.usp_destination_list");

  return result.recordset || [];
}
