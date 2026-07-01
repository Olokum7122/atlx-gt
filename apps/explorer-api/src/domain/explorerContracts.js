// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function normalizeInt(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
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

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// ─── Tenant Mappers ─────────────────────────────────────────────────────────

export function mapTenant(row) {
  if (!row) return null;
  return {
    tenantId: normalizeText(row.tenant_id),
    tenantType: normalizeText(row.tenant_type) || "personal",
    displayName: normalizeText(row.display_name),
    legalName: normalizeText(row.legal_name),
    logoUrl: normalizeText(row.logo_url),
    primaryColor: normalizeText(row.primary_color),
    watermarkText: normalizeText(row.watermark_text) || "@AntojadosMx",
    watermarkLogoUrl: normalizeText(row.watermark_logo_url),
    status: normalizeText(row.status) || "active",
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

export function mapTenantList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapTenant).filter(Boolean);
}

// ─── User Mappers ────────────────────────────────────────────────────────────

export function mapUser(row) {
  if (!row) return null;
  return {
    userId: normalizeText(row.user_id),
    tenantId: normalizeText(row.tenant_id),
    authProvider: normalizeText(row.auth_provider),
    authSubject: normalizeText(row.auth_subject),
    emailHash: normalizeText(row.email_hash),
    displayName: normalizeText(row.display_name),
    avatarUrl: normalizeText(row.avatar_url),
    role: normalizeText(row.role) || "editor",
    status: normalizeText(row.status) || "active",
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

export function mapUserList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapUser).filter(Boolean);
}

// ─── Project Mappers ─────────────────────────────────────────────────────────

export function mapProject(row) {
  if (!row) return null;
  return {
    projectId: normalizeText(row.project_id),
    tenantId: normalizeText(row.tenant_id),
    ownerUserId: normalizeText(row.owner_user_id),
    title: normalizeText(row.title),
    tipoPost: normalizeText(row.tipo_post),
    tipoContent: normalizeText(row.tipo_content),
    efectoGlobal: normalizeText(row.efecto_global),
    composicion: parseJson(row.composicion),
    mediaAssetId: normalizeText(row.media_asset_id),
    mediaUrl: normalizeText(row.media_url),
    mediaThumbnailUrl: normalizeText(row.media_thumbnail_url),
    mediaFeedUrl: normalizeText(row.media_feed_url),
    mediaFullUrl: normalizeText(row.media_full_url),
    mediaType: normalizeText(row.media_type),
    status: normalizeText(row.status) || "draft",
    publishedAt: normalizeDate(row.published_at),
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

export function mapProjectList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapProject).filter(Boolean);
}

// ─── Destination Mappers ─────────────────────────────────────────────────────

export function mapDestination(row) {
  if (!row) return null;
  return {
    destinationId: normalizeText(row.destination_id),
    tenantId: normalizeText(row.tenant_id),
    destinationType: normalizeText(row.destination_type),
    displayName: normalizeText(row.display_name),
    externalRef: normalizeText(row.external_ref),
    settings: parseJson(row.settings_json),
    status: normalizeText(row.status) || "active",
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

export function mapDestinationList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapDestination).filter(Boolean);
}

// ─── Publication Mappers ─────────────────────────────────────────────────────

export function mapPublication(row) {
  if (!row) return null;
  return {
    publicationId: normalizeText(row.publication_id),
    tenantId: normalizeText(row.tenant_id),
    projectId: normalizeText(row.project_id),
    destinationId: normalizeText(row.destination_id),
    externalPostId: normalizeText(row.external_post_id),
    feedType: normalizeText(row.feed_type),
    status: normalizeText(row.status) || "draft",
    payload: parseJson(row.payload_json),
    errorMessage: normalizeText(row.error_message),
    createdAt: normalizeDate(row.created_at),
    publishedAt: normalizeDate(row.published_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

export function mapPublicationList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapPublication).filter(Boolean);
}

// ─── Project Asset Mappers ───────────────────────────────────────────────────

export function mapProjectAsset(row) {
  if (!row) return null;
  return {
    assetId: normalizeText(row.asset_id),
    projectId: normalizeText(row.project_id),
    tenantId: normalizeText(row.tenant_id),
    mediaAssetId: normalizeText(row.media_asset_id),
    role: normalizeText(row.role) || "source",
    originalUrl: normalizeText(row.original_url),
    thumbUrl: normalizeText(row.thumb_url),
    feedUrl: normalizeText(row.feed_url),
    fullUrl: normalizeText(row.full_url),
    sortOrder: normalizeInt(row.sort_order) ?? 0,
    status: normalizeText(row.status) || "active",
    createdAt: normalizeDate(row.created_at),
  };
}

export function mapProjectAssetList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapProjectAsset).filter(Boolean);
}
