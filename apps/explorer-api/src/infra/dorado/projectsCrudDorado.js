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
 * Crea un proyecto (borrador).
 * SP: explorer_core.usp_project_create
 */
export async function createProjectCrud({
  projectId,
  tenantId,
  ownerUserId,
  title,
  tipoPost,
  tipoContent,
  efectoGlobal,
  composicion,
  mediaAssetId,
  mediaUrl,
  mediaThumbnailUrl,
  mediaFeedUrl,
  mediaFullUrl,
  mediaType,
}) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("project_id", sql.VarChar(50), normalizeText(projectId))
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .input("owner_user_id", sql.VarChar(50), normalizeText(ownerUserId) || null)
    .input("title", sql.NVarChar(500), normalizeText(title) || null)
    .input("tipo_post", sql.VarChar(50), normalizeText(tipoPost) || null)
    .input("tipo_content", sql.VarChar(50), normalizeText(tipoContent) || null)
    .input("efecto_global", sql.VarChar(50), normalizeText(efectoGlobal) || null)
    .input("composicion", sql.NVarChar(sql.MAX), normalizeJson(composicion) || null)
    .input("media_asset_id", sql.VarChar(255), normalizeText(mediaAssetId) || null)
    .input("media_url", sql.NVarChar(500), normalizeText(mediaUrl) || null)
    .input("media_thumbnail_url", sql.NVarChar(500), normalizeText(mediaThumbnailUrl) || null)
    .input("media_feed_url", sql.NVarChar(500), normalizeText(mediaFeedUrl) || null)
    .input("media_full_url", sql.NVarChar(500), normalizeText(mediaFullUrl) || null)
    .input("media_type", sql.VarChar(20), normalizeText(mediaType) || null)
    .execute("explorer_core.usp_project_create");

  return result.recordset?.[0] || null;
}

/**
 * Obtiene un proyecto por ID.
 * SP: explorer_core.usp_project_get
 */
export async function getProjectCrud(projectId) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("project_id", sql.VarChar(50), normalizeText(projectId))
    .execute("explorer_core.usp_project_get");

  return result.recordset?.[0] || null;
}

/**
 * Lista proyectos con filtros.
 * SP: explorer_core.usp_project_list
 */
export async function listProjectsCrud({
  tenantId,
  ownerUserId,
  status,
  tipoPost,
  limit = 50,
  offset = 0,
}) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .input("owner_user_id", sql.VarChar(50), normalizeText(ownerUserId) || null)
    .input("status", sql.VarChar(20), normalizeText(status) || null)
    .input("tipo_post", sql.VarChar(50), normalizeText(tipoPost) || null)
    .input("limit", sql.Int, Number(limit) || 50)
    .input("offset", sql.Int, Number(offset) || 0)
    .execute("explorer_core.usp_project_list");

  return {
    rows: result.recordsets?.[0] || [],
    total: result.recordsets?.[1]?.[0]?.total ?? 0,
  };
}

/**
 * Actualiza metadata de un proyecto.
 * SP: explorer_core.usp_project_update
 */
export async function updateProjectCrud({
  projectId,
  title,
  tipoPost,
  tipoContent,
  efectoGlobal,
  composicion,
  mediaAssetId,
  mediaUrl,
  mediaThumbnailUrl,
  mediaFeedUrl,
  mediaFullUrl,
  mediaType,
}) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("project_id", sql.VarChar(50), normalizeText(projectId))
    .input("title", sql.NVarChar(500), normalizeText(title) || null)
    .input("tipo_post", sql.VarChar(50), normalizeText(tipoPost) || null)
    .input("tipo_content", sql.VarChar(50), normalizeText(tipoContent) || null)
    .input("efecto_global", sql.VarChar(50), normalizeText(efectoGlobal) || null)
    .input("composicion", sql.NVarChar(sql.MAX), normalizeJson(composicion) || null)
    .input("media_asset_id", sql.VarChar(255), normalizeText(mediaAssetId) || null)
    .input("media_url", sql.NVarChar(500), normalizeText(mediaUrl) || null)
    .input("media_thumbnail_url", sql.NVarChar(500), normalizeText(mediaThumbnailUrl) || null)
    .input("media_feed_url", sql.NVarChar(500), normalizeText(mediaFeedUrl) || null)
    .input("media_full_url", sql.NVarChar(500), normalizeText(mediaFullUrl) || null)
    .input("media_type", sql.VarChar(20), normalizeText(mediaType) || null)
    .execute("explorer_core.usp_project_update");

  return result.recordset?.[0] || null;
}

/**
 * Cambia el estado de un proyecto.
 * SP: explorer_core.usp_project_set_status
 */
export async function setProjectStatusCrud(projectId, status, publishedAt) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("project_id", sql.VarChar(50), normalizeText(projectId))
    .input("status", sql.VarChar(20), normalizeText(status))
    .input("published_at", sql.DateTime2(7), publishedAt || null)
    .execute("explorer_core.usp_project_set_status");

  return result.recordset?.[0] || null;
}

/**
 * Adjunta un asset a un proyecto.
 * SP: explorer_core.usp_project_asset_attach
 */
export async function attachProjectAssetCrud({
  assetId,
  projectId,
  tenantId,
  mediaAssetId,
  role,
  originalUrl,
  thumbUrl,
  feedUrl,
  fullUrl,
  sortOrder,
}) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("asset_id", sql.VarChar(50), normalizeText(assetId))
    .input("project_id", sql.VarChar(50), normalizeText(projectId))
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .input("media_asset_id", sql.VarChar(255), normalizeText(mediaAssetId) || null)
    .input("role", sql.VarChar(50), normalizeText(role) || "source")
    .input("original_url", sql.NVarChar(500), normalizeText(originalUrl) || null)
    .input("thumb_url", sql.NVarChar(500), normalizeText(thumbUrl) || null)
    .input("feed_url", sql.NVarChar(500), normalizeText(feedUrl) || null)
    .input("full_url", sql.NVarChar(500), normalizeText(fullUrl) || null)
    .input("sort_order", sql.Int, Number(sortOrder) ?? 0)
    .execute("explorer_core.usp_project_asset_attach");

  return result.recordset?.[0] || null;
}
