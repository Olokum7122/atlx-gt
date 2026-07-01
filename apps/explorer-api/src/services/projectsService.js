import crypto from "node:crypto";
import {
  createProjectCrud,
  getProjectCrud,
  listProjectsCrud,
  updateProjectCrud,
  setProjectStatusCrud,
  attachProjectAssetCrud,
} from "../infra/dorado/projectsCrudDorado.js";
import { mapProject, mapProjectList, mapProjectAsset } from "../domain/explorerContracts.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTraceIds(payload = {}) {
  const requestId = normalizeText(payload.request_id) || crypto.randomUUID();
  const correlationId = normalizeText(payload.correlation_id) || crypto.randomUUID();
  return { requestId, correlationId };
}

export async function createProjectService(payload) {
  const trace = normalizeTraceIds(payload);

  const row = await createProjectCrud({
    projectId: payload.project_id,
    tenantId: payload.tenant_id,
    ownerUserId: payload.owner_user_id,
    title: payload.title,
    tipoPost: payload.tipo_post,
    tipoContent: payload.tipo_content,
    efectoGlobal: payload.efecto_global,
    composicion: payload.composicion,
    mediaAssetId: payload.media_asset_id,
    mediaUrl: payload.media_url,
    mediaThumbnailUrl: payload.media_thumbnail_url,
    mediaFeedUrl: payload.media_feed_url,
    mediaFullUrl: payload.media_full_url,
    mediaType: payload.media_type,
  });

  return {
    project: mapProject(row),
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  };
}

export async function getProjectService(projectId) {
  const row = await getProjectCrud(projectId);
  return { project: mapProject(row) };
}

export async function listProjectsService(tenantId, query = {}) {
  const result = await listProjectsCrud({
    tenantId,
    ownerUserId: query.owner_user_id,
    status: query.status,
    tipoPost: query.tipo_post,
    limit: query.limit,
    offset: query.offset,
  });

  return {
    projects: mapProjectList(result.rows),
    total: result.total,
  };
}

export async function updateProjectService(payload) {
  const trace = normalizeTraceIds(payload);

  const row = await updateProjectCrud({
    projectId: payload.project_id,
    title: payload.title,
    tipoPost: payload.tipo_post,
    tipoContent: payload.tipo_content,
    efectoGlobal: payload.efecto_global,
    composicion: payload.composicion,
    mediaAssetId: payload.media_asset_id,
    mediaUrl: payload.media_url,
    mediaThumbnailUrl: payload.media_thumbnail_url,
    mediaFeedUrl: payload.media_feed_url,
    mediaFullUrl: payload.media_full_url,
    mediaType: payload.media_type,
  });

  return {
    project: mapProject(row),
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  };
}

export async function setProjectStatusService(projectId, status, publishedAt) {
  const row = await setProjectStatusCrud(projectId, status, publishedAt);
  return { project: mapProject(row) };
}

export async function attachAssetService(payload) {
  const trace = normalizeTraceIds(payload);

  const row = await attachProjectAssetCrud({
    assetId: payload.asset_id,
    projectId: payload.project_id,
    tenantId: payload.tenant_id,
    mediaAssetId: payload.media_asset_id,
    role: payload.role,
    originalUrl: payload.original_url,
    thumbUrl: payload.thumb_url,
    feedUrl: payload.feed_url,
    fullUrl: payload.full_url,
    sortOrder: payload.sort_order,
  });

  return {
    asset: mapProjectAsset(row),
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  };
}
