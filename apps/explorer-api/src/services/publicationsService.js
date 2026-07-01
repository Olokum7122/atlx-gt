import crypto from "node:crypto";
import {
  createPublicationCrud,
  markPublicationPublishedCrud,
  markPublicationErrorCrud,
  listPublicationsCrud,
} from "../infra/dorado/publicationsCrudDorado.js";
import { getProjectCrud, setProjectStatusCrud } from "../infra/dorado/projectsCrudDorado.js";
import {
  mapPublication,
  mapPublicationList,
} from "../domain/explorerContracts.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTraceIds(payload = {}) {
  const requestId = normalizeText(payload.request_id) || crypto.randomUUID();
  const correlationId = normalizeText(payload.correlation_id) || crypto.randomUUID();
  return { requestId, correlationId };
}

/**
 * Publica un proyecto directamente en Explorer DB.
 * 
 * Flujo:
 * 1. Obtiene el proyecto
 * 2. Genera post_id
 * 3. Crea registro de publicación con payload_json (composición completa)
 * 4. Marca como published inmediatamente
 * 
 * Ya NO envía a Antojados API. El consumo se hace vía GET /feed/:feedType
 * que devuelve la composición JSON para que las apps rendericen interactivamente.
 */
export async function publishProjectService(payload) {
  const trace = normalizeTraceIds(payload);
  const projectId = normalizeText(payload.project_id);
  const destinationId = normalizeText(payload.destination_id);
  const tenantId = normalizeText(payload.tenant_id);
  const actorUserId = normalizeText(payload.actor_user_id);

  if (!projectId || !destinationId || !tenantId) {
    throw new Error("publishProjectService: project_id, destination_id y tenant_id requeridos");
  }

  // 1. Obtener proyecto
  const project = await getProjectCrud(projectId);
  if (!project) {
    throw new Error(`publishProjectService: project ${projectId} no encontrado`);
  }

  // 2. Generar post_id
  const feedType = normalizeText(payload.feed_type) || "que-pex";
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().slice(0, 8);
  const postId = `${feedType}-${timestamp}-${random}`;

  // 3. Crear publicación con payload_json completo
  const publication = await createPublicationCrud({
    publicationId: `pub-${projectId}-${Date.now().toString(36)}`,
    tenantId,
    projectId,
    destinationId,
    externalPostId: postId,
    feedType,
    payloadJson: {
      project_id: projectId,
      title: project.title,
      composicion: project.composicion,
      media_url: project.media_url,
      media_feed_url: project.media_feed_url,
      media_thumbnail_url: project.media_thumbnail_url,
      media_full_url: project.media_full_url,
      media_type: project.media_type,
      feed_type: feedType,
      creator_id: actorUserId || project.owner_user_id,
      source_app: "explorer",
      author_handle: payload.author_handle || "Explorador",
      author_avatar_url: payload.author_avatar_url || null,
    },
  });

  if (!publication) {
    throw new Error("publishProjectService: no se pudo crear registro de publicación");
  }

  // 4. Marcar como published inmediatamente
  try {
    const updatedPub = await markPublicationPublishedCrud(publication.publication_id, postId, new Date());
    await setProjectStatusCrud(projectId, "published", new Date());

    return {
      publication: mapPublication(updatedPub || publication),
      post_id: postId,
      request_id: trace.requestId,
      correlation_id: trace.correlationId,
    };
  } catch (error) {
    await markPublicationErrorCrud(
      publication.publication_id,
      error.message,
    );
    throw error;
  }
}

/**
 * Obtiene una publicación por ID.
 */
export async function getPublicationService(publicationId) {
  const result = await listPublicationsCrud({
    tenantId: null,
    projectId: null,
    status: null,
    feedType: null,
    limit: 1,
    offset: 0,
  });
  const row = result.rows.find((r) => r.publication_id === publicationId);
  return { publication: mapPublication(row) };
}

/**
 * Lista publicaciones (para admin).
 */
export async function listPublicationsService(tenantId, query = {}) {
  const result = await listPublicationsCrud({
    tenantId,
    projectId: query.project_id,
    status: query.status,
    feedType: query.feed_type,
    limit: query.limit,
    offset: query.offset,
  });

  return {
    publications: mapPublicationList(result.rows),
    total: result.total,
  };
}

/**
 * Sirve el feed de consumo para apps móviles.
 * GET /tenants/:tenantId/feed/:feedType
 * 
 * Devuelve publicaciones publicadas con la composición JSON completa
 * para que la app renderice los blocks interactivamente.
 */
export async function getComposicionFeedService(tenantId, feedType, query = {}) {
  if (!tenantId) {
    throw new Error("getComposicionFeedService: tenant_id requerido");
  }

  const result = await listPublicationsCrud({
    tenantId,
    projectId: null,
    status: "published",
    feedType: feedType || null,
    limit: Number(query.limit) || 50,
    offset: Number(query.offset) || 0,
  });

  // Transformar publicaciones al formato de consumo
  const items = (result.rows || []).map((row) => {
    let payload = {};
    try {
      payload = typeof row.payload_json === "string"
        ? JSON.parse(row.payload_json)
        : (row.payload_json || {});
    } catch {
      payload = {};
    }

    return {
      id: row.external_post_id || row.publication_id,
      feed_type: row.feed_type,
      destination_id: row.destination_id,
      published_at: row.published_at,
      // Composición completa para render interactivo
      composicion: payload.composicion || null,
      // Metadata adicional
      title: payload.title || null,
      media_url: payload.media_url || null,
      media_feed_url: payload.media_feed_url || null,
      media_thumbnail_url: payload.media_thumbnail_url || null,
      media_full_url: payload.media_full_url || null,
      media_type: payload.media_type || null,
      author_handle: payload.author_handle || null,
      author_avatar_url: payload.author_avatar_url || null,
    };
  });

  return {
    items,
    total: result.total,
  };
}