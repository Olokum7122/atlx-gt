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
 * Crea un registro de publicación.
 * SP: explorer_core.usp_publication_create
 */
export async function createPublicationCrud({
  publicationId,
  tenantId,
  projectId,
  destinationId,
  externalPostId,
  feedType,
  payloadJson,
}) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("publication_id", sql.VarChar(50), normalizeText(publicationId))
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .input("project_id", sql.VarChar(50), normalizeText(projectId) || null)
    .input("destination_id", sql.VarChar(50), normalizeText(destinationId) || null)
    .input("external_post_id", sql.VarChar(255), normalizeText(externalPostId) || null)
    .input("feed_type", sql.VarChar(50), normalizeText(feedType) || null)
    .input("payload_json", sql.NVarChar(sql.MAX), normalizeJson(payloadJson) || null)
    .execute("explorer_core.usp_publication_create");

  return result.recordset?.[0] || null;
}

/**
 * Marca una publicación como publicada.
 * SP: explorer_core.usp_publication_mark_published
 */
export async function markPublicationPublishedCrud(publicationId, externalPostId, publishedAt) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("publication_id", sql.VarChar(50), normalizeText(publicationId))
    .input("external_post_id", sql.VarChar(255), normalizeText(externalPostId) || null)
    .input("published_at", sql.DateTime2(7), publishedAt || null)
    .execute("explorer_core.usp_publication_mark_published");

  return result.recordset?.[0] || null;
}

/**
 * Marca una publicación como error.
 * SP: explorer_core.usp_publication_mark_error
 */
export async function markPublicationErrorCrud(publicationId, errorMessage) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("publication_id", sql.VarChar(50), normalizeText(publicationId))
    .input("error_message", sql.NVarChar(sql.MAX), normalizeText(errorMessage) || "")
    .execute("explorer_core.usp_publication_mark_error");

  return result.recordset?.[0] || null;
}

/**
 * Lista publicaciones con filtros.
 * SP: explorer_core.usp_publication_list
 */
export async function listPublicationsCrud({
  tenantId,
  projectId,
  status,
  feedType,
  limit = 50,
  offset = 0,
}) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .input("project_id", sql.VarChar(50), normalizeText(projectId) || null)
    .input("status", sql.VarChar(20), normalizeText(status) || null)
    .input("feed_type", sql.VarChar(50), normalizeText(feedType) || null)
    .input("limit", sql.Int, Number(limit) || 50)
    .input("offset", sql.Int, Number(offset) || 0)
    .execute("explorer_core.usp_publication_list");

  return {
    rows: result.recordsets?.[0] || [],
    total: result.recordsets?.[1]?.[0]?.total ?? 0,
  };
}
