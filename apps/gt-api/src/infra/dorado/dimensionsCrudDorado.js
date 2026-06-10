import { getAppPool, sqlType } from "../../db/sql.js";
import { GT_COMPATIBILITY_SCOPE_ID } from "../../domain/gtTenantPolicy.js";

const sql = sqlType();

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function deriveParentCode(dimCode) {
  if (!dimCode || !dimCode.includes(".")) return null;
  const parts = dimCode.split(".").filter(Boolean);
  return parts.length <= 1 ? null : parts.slice(0, -1).join(".");
}

function computeHierarchyLevel(dimCode) {
  if (!dimCode || !dimCode.trim()) return 1;
  return dimCode.trim().split(".").filter(Boolean).length;
}

function computeModuleCode(dimCode) {
  if (!dimCode || !dimCode.trim()) return null;
  return dimCode.trim().split(".").filter(Boolean)[0] || null;
}

// ─────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────
export async function listDimensionsCrudDorado({ includeInactive }) {
  const pool = await getAppPool();
  const result = await pool.request().query(`
    SELECT
      dimension_id,
      tenant_id,
      dim_type,
      dim_code,
      label,
      dim_label,
      parent_type,
      parent_code,
      parent_node_id,
      review_status,
      is_active,
      source,
      detected_at,
      reviewed_at,
      reviewed_by,
      meta_json,
      created_at,
      updated_at,
      node_kind,
      hierarchy_level,
      module_code,
      area_code,
      subarea_code,
      component_code
    FROM core_configuracion.sec_dimensions
    ${includeInactive ? "" : "WHERE is_active = 1"}
    ORDER BY dim_code;
  `);
  return result.recordset;
}

// ─────────────────────────────────────────────────────────
// APPROVE (UPSERT)
// ─────────────────────────────────────────────────────────
export async function approveDimensionsCrudDorado(rows) {
  const pool = await getAppPool();

  for (const row of rows) {
    const dimCode    = normalizeCode(row.dim_code);
    const parentCode = row.parent_code != null
      ? normalizeCode(row.parent_code)
      : row.parent_node_id != null
      ? normalizeCode(row.parent_node_id)
      : deriveParentCode(dimCode);
    const dimId      = row.dimension_id || dimCode;
    const tenantId   = row.tenant_id    || GT_COMPATIBILITY_SCOPE_ID;
    const dimType    = row.dim_type     || null;
    const label      = row.label        || dimCode;
    const dimLabel   = row.dim_label    || label;
    const nodeKind   = row.node_kind    || dimType;
    const lvl        = row.hierarchy_level != null
      ? row.hierarchy_level
      : computeHierarchyLevel(dimCode);
    const modCode    = row.module_code  || computeModuleCode(dimCode);
    const metaJson   = row.meta_json    || null;
    const source     = row.source       || "GT_SCANNER";

    await pool
      .request()
      .input("dimension_id",    sql.NVarChar(200),     dimId)
      .input("tenant_id",       sql.NVarChar(36),      tenantId)
      .input("dim_code",        sql.NVarChar(100),     dimCode)
      .input("parent_code",     sql.NVarChar(100),     parentCode)
      .input("dim_type",        sql.NVarChar(40),      dimType)
      .input("label",           sql.NVarChar(300),     label)
      .input("dim_label",       sql.NVarChar(300),     dimLabel)
      .input("node_kind",       sql.NVarChar(80),      nodeKind)
      .input("hierarchy_level", sql.Int,               lvl)
      .input("module_code",     sql.NVarChar(100),     modCode)
      .input("area_code",       sql.NVarChar(100),     row.area_code      || null)
      .input("subarea_code",    sql.NVarChar(100),     row.subarea_code   || null)
      .input("component_code",  sql.NVarChar(100),     row.component_code || null)
      .input("meta_json",       sql.NVarChar(sql.MAX), metaJson)
      .input("source",          sql.NVarChar(80),      source)
      .query(`
        MERGE core_configuracion.sec_dimensions AS tgt
        USING (SELECT @dim_code AS dim_code) AS src
          ON tgt.dim_code = src.dim_code
        WHEN MATCHED THEN
          UPDATE SET
            tenant_id       = @tenant_id,
            parent_code     = @parent_code,
            dim_type        = @dim_type,
            label           = @label,
            dim_label       = @dim_label,
            node_kind       = @node_kind,
            hierarchy_level = @hierarchy_level,
            module_code     = @module_code,
            area_code       = @area_code,
            subarea_code    = @subarea_code,
            component_code  = @component_code,
            meta_json       = COALESCE(@meta_json, meta_json),
            review_status   = 'APPROVED',
            reviewed_at     = SYSUTCDATETIME(),
            reviewed_by     = 'gt-api',
            updated_at      = SYSUTCDATETIME(),
            is_active       = 1
        WHEN NOT MATCHED THEN
          INSERT (
            dimension_id, tenant_id, dim_code, parent_code, dim_type,
            label, dim_label, parent_node_id, node_kind, hierarchy_level,
            module_code, area_code, subarea_code, component_code,
            meta_json, source, review_status, detected_at,
            reviewed_at, reviewed_by, created_at, updated_at, is_active
          )
          VALUES (
            @dimension_id, @tenant_id, @dim_code, @parent_code, @dim_type,
            @label, @dim_label, @parent_code, @node_kind, @hierarchy_level,
            @module_code, @area_code, @subarea_code, @component_code,
            @meta_json, @source, 'APPROVED', SYSUTCDATETIME(),
            SYSUTCDATETIME(), 'gt-api', SYSUTCDATETIME(), SYSUTCDATETIME(), 1
          );
      `);
  }
}

// ─────────────────────────────────────────────────────────
// UPDATE (label / dim_type / parent_code / meta_json)
// ─────────────────────────────────────────────────────────
export async function updateDimensionCrudDorado(payload) {
  const pool    = await getAppPool();
  const dimCode = normalizeCode(payload.dim_code);

  const check = await pool
    .request()
    .input("dim_code", sql.NVarChar(100), dimCode)
    .query("SELECT TOP 1 dim_code FROM core_configuracion.sec_dimensions WHERE dim_code = @dim_code");

  if (!check.recordset.length) return { found: false };

  await pool
    .request()
    .input("dim_code",    sql.NVarChar(100),     dimCode)
    .input("label",       sql.NVarChar(300),     payload.label       || null)
    .input("dim_type",    sql.NVarChar(40),      payload.dim_type    || null)
    .input("parent_code", sql.NVarChar(100),     payload.parent_code || null)
    .input("meta_json",   sql.NVarChar(sql.MAX), payload.meta_json   || null)
    .query(`
      UPDATE core_configuracion.sec_dimensions
      SET
        label       = COALESCE(@label,       label),
        dim_type    = COALESCE(@dim_type,    dim_type),
        parent_code = COALESCE(@parent_code, parent_code),
        meta_json   = COALESCE(@meta_json,   meta_json),
        updated_at  = SYSUTCDATETIME()
      WHERE dim_code = @dim_code;
    `);

  return { found: true, dimCode };
}

// ─────────────────────────────────────────────────────────
// REMOVE (soft delete)
// ─────────────────────────────────────────────────────────
export async function removeDimensionsCrudDorado(dimCodes) {
  const pool = await getAppPool();
  let removed = 0;

  for (const raw of dimCodes) {
    const dimCode = normalizeCode(raw);
    const r = await pool
      .request()
      .input("dim_code", sql.NVarChar(100), dimCode)
      .query(`
        UPDATE core_configuracion.sec_dimensions
        SET is_active = 0, review_status = 'RETIRED', updated_at = SYSUTCDATETIME()
        WHERE dim_code = @dim_code AND is_active = 1;
      `);
    removed += r.rowsAffected[0] || 0;
  }

  return removed;
}

// ─────────────────────────────────────────────────────────
// ACTIVATE (re-enable)
// ─────────────────────────────────────────────────────────
export async function activateDimensionsCrudDorado(dimCodes) {
  const pool = await getAppPool();
  let activated = 0;

  for (const raw of dimCodes) {
    const dimCode = normalizeCode(raw);
    const r = await pool
      .request()
      .input("dim_code", sql.NVarChar(100), dimCode)
      .query(`
        UPDATE core_configuracion.sec_dimensions
        SET is_active = 1, review_status = 'APPROVED',
            reviewed_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
        WHERE dim_code = @dim_code AND is_active = 0;
      `);
    activated += r.rowsAffected[0] || 0;
  }

  return activated;
}

// ─────────────────────────────────────────────────────────
// PURGE ALL (hard delete — usar solo para reconstrucción total de la tabla)
// ─────────────────────────────────────────────────────────
export async function purgeAllDimensionsCrudDorado() {
  const pool = await getAppPool();
  const r = await pool.request().query(`
    DELETE FROM core_configuracion.sec_dimensions;
  `);
  return r.rowsAffected[0] || 0;
}
