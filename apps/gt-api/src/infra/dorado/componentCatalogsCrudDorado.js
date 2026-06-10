import crypto from "node:crypto";
import { getAppPool, sqlType } from "../../db/sql.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "_");
}

function normalizeAreaCode(value) {
  const normalized = normalizeCode(value);
  if (!normalized) return "";
  const parts = normalized.split(".").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : normalized;
}

function toOption(row, codeKey, labelKey) {
  const value = normalizeCode(row?.[codeKey]);
  if (!value) return null;
  return {
    value,
    label: normalizeText(row?.[labelKey]) || value,
  };
}

export async function getModuleOptionsCrudDorado() {
  const pool = await getAppPool();
  const result = await pool.request().query(`
    SELECT DISTINCT
      UPPER(NULLIF(module_code, '')) AS module_code,
      MAX(COALESCE(NULLIF(node_label, ''), NULLIF(module_code, ''))) AS module_label
    FROM core_configuracion.loc_locations
    WHERE is_active = 1
      AND UPPER(COALESCE(NULLIF(node_kind, ''), '')) = 'MODULE'
      AND NULLIF(module_code, '') IS NOT NULL
    GROUP BY UPPER(NULLIF(module_code, ''))
    ORDER BY module_code;
  `);

  return (result.recordset || []).map((row) => toOption(row, "module_code", "module_label")).filter(Boolean);
}

export async function getAreaOptionsCrudDorado(moduleCode) {
  const pool = await getAppPool();
  const safeModuleCode = normalizeCode(moduleCode);

  const result = await pool
    .request()
    .input("module_code", sql.NVarChar(120), safeModuleCode || "")
    .query(`
      SELECT DISTINCT
        UPPER(NULLIF(area_code, '')) AS area_code_raw,
        MAX(COALESCE(NULLIF(node_label, ''), NULLIF(area_code, ''))) AS area_label
      FROM core_configuracion.loc_locations
      WHERE is_active = 1
        AND UPPER(COALESCE(NULLIF(node_kind, ''), '')) = 'AREA'
        AND (@module_code = '' OR UPPER(COALESCE(NULLIF(module_code, ''), '')) = @module_code)
      GROUP BY UPPER(NULLIF(area_code, ''))
      ORDER BY area_code_raw;
    `);

  return Array.from(
    new Map(
      (result.recordset || []).map((row) => {
        const value = normalizeAreaCode(row.area_code_raw);
        const label = normalizeText(row.area_label) || value;
        return [value, { value, label }];
      }),
    ).values(),
  ).filter((item) => Boolean(item.value));
}

export async function getComponentOptionsCrudDorado(moduleCode, areaCode) {
  const pool = await getAppPool();
  const safeModuleCode = normalizeCode(moduleCode);
  const safeAreaCode = normalizeAreaCode(areaCode);

  const result = await pool
    .request()
    .input("module_code", sql.NVarChar(120), safeModuleCode || "")
    .input("area_code", sql.NVarChar(120), safeAreaCode || "")
    .query(`
      SELECT DISTINCT
        UPPER(NULLIF(component_code, '')) AS component_code,
        MAX(COALESCE(NULLIF(node_label, ''), NULLIF(component_code, ''))) AS component_label
      FROM core_configuracion.loc_locations
      WHERE is_active = 1
        AND UPPER(COALESCE(NULLIF(node_kind, ''), '')) = 'COMPONENT'
        AND (@module_code = '' OR UPPER(COALESCE(NULLIF(module_code, ''), '')) = @module_code)
        AND (
          @area_code = ''
          OR UPPER(
            CASE
              WHEN CHARINDEX('.', COALESCE(NULLIF(area_code, ''), '')) > 0
                THEN RIGHT(
                  COALESCE(NULLIF(area_code, ''), ''),
                  CHARINDEX('.', REVERSE(COALESCE(NULLIF(area_code, ''), ''))) - 1
                )
              ELSE COALESCE(NULLIF(area_code, ''), '')
            END
          ) = @area_code
        )
      GROUP BY UPPER(NULLIF(component_code, ''))
      ORDER BY component_code;
    `);

  return (result.recordset || []).map((row) => toOption(row, "component_code", "component_label")).filter(Boolean);
}

export async function listComponentCatalogMappingsCrudDorado(filters = {}) {
  const pool = await getAppPool();
  const moduleCode = normalizeCode(filters.moduleCode);
  const areaCode = normalizeAreaCode(filters.areaCode);
  const componentCode = normalizeCode(filters.componentCode);

  const result = await pool
    .request()
    .input("module_code", sql.NVarChar(120), moduleCode || "")
    .input("area_code", sql.NVarChar(120), areaCode || "")
    .input("component_code", sql.NVarChar(120), componentCode || "")
    .query(`
      SELECT
        m.map_id,
        UPPER(m.component_code) AS component_code,
        COALESCE(d.label, d.dim_label, d.dim_code, m.component_code) AS component_label,
        UPPER(m.catalog_code) AS catalog_code,
        COALESCE(c.name, c.code, m.catalog_code) AS catalog_label,
        COALESCE(d.module_code, '') AS module_code,
        COALESCE(d.area_code, '') AS area_code,
        m.review_status,
        m.is_active,
        m.updated_at
      FROM core_configuracion.sec_component_catalog_map AS m
      LEFT JOIN core_configuracion.sec_dimensions AS d
        ON d.is_active = 1
       AND d.review_status = 'APPROVED'
       AND d.dim_type = 'COMPONENT'
       AND UPPER(COALESCE(NULLIF(d.component_code, ''), NULLIF(d.dim_code, ''))) = UPPER(m.component_code)
      LEFT JOIN core_configuracion.cat_catalogos AS c
        ON c.is_active = 1
       AND UPPER(c.code) = UPPER(m.catalog_code)
      WHERE m.is_active = 1
        AND (@module_code = '' OR UPPER(COALESCE(NULLIF(d.module_code, ''), '')) = @module_code)
        AND (
          @area_code = ''
          OR UPPER(
            CASE
              WHEN CHARINDEX('.', COALESCE(NULLIF(d.area_code, ''), '')) > 0
                THEN RIGHT(
                  COALESCE(NULLIF(d.area_code, ''), ''),
                  CHARINDEX('.', REVERSE(COALESCE(NULLIF(d.area_code, ''), ''))) - 1
                )
              ELSE COALESCE(NULLIF(d.area_code, ''), '')
            END
          ) = @area_code
        )
        AND (@component_code = '' OR UPPER(m.component_code) = @component_code)
      ORDER BY UPPER(m.component_code), UPPER(m.catalog_code);
    `);

  return (result.recordset || []).map((row) => ({
    id: String(row.map_id || ""),
    moduleCode: normalizeCode(row.module_code),
    areaCode: normalizeAreaCode(row.area_code),
    componentCode: normalizeCode(row.component_code),
    componentLabel: normalizeText(row.component_label) || normalizeCode(row.component_code),
    catalogCode: normalizeCode(row.catalog_code),
    catalogLabel: normalizeText(row.catalog_label) || normalizeCode(row.catalog_code),
    status: normalizeText(row.review_status) || "APPROVED",
    isActive: Number(row.is_active ?? 1) === 1,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }));
}

export async function getCatalogChecklistForComponentCrudDorado(componentCode) {
  const pool = await getAppPool();
  const safeComponentCode = normalizeCode(componentCode);

  const result = await pool
    .request()
    .input("component_code", sql.NVarChar(120), safeComponentCode || "")
    .query(`
      SELECT
        UPPER(c.code) AS catalog_code,
        c.name AS catalog_label,
        CASE
          WHEN @component_code <> '' AND m.map_id IS NOT NULL THEN 1
          ELSE 0
        END AS checked
      FROM core_configuracion.cat_catalogos AS c
      LEFT JOIN core_configuracion.sec_component_catalog_map AS m
        ON m.is_active = 1
       AND UPPER(m.catalog_code) = UPPER(c.code)
       AND @component_code <> ''
       AND UPPER(m.component_code) = @component_code
      WHERE c.is_active = 1
      ORDER BY UPPER(c.code);
    `);

  return (result.recordset || []).map((row) => ({
    key: normalizeCode(row.catalog_code),
    title: `${normalizeText(row.catalog_label) || normalizeCode(row.catalog_code)} (${normalizeCode(row.catalog_code)})`,
    subtitle: "Catálogo disponible",
    checked: Number(row.checked || 0) === 1,
  }));
}

export async function listComponentCatalogStateCrudDorado(componentCode) {
  const pool = await getAppPool();
  const safeComponentCode = normalizeCode(componentCode);

  const result = await pool
    .request()
    .input("component_code", sql.NVarChar(120), safeComponentCode)
    .query(`
      SELECT
        map_id,
        UPPER(catalog_code) AS catalog_code,
        is_active
      FROM core_configuracion.sec_component_catalog_map
      WHERE UPPER(component_code) = @component_code;
    `);

  return (result.recordset || []).map((row) => ({
    id: String(row.map_id || ""),
    catalogCode: normalizeCode(row.catalog_code),
    isActive: Number(row.is_active ?? 1) === 1,
  }));
}

export async function applyReplaceMappingsPlanCrudDorado(plan) {
  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);

  const componentCode = normalizeCode(plan.componentCode);
  const toReactivate = Array.from(new Set((plan.toReactivate || []).map((item) => normalizeText(item)).filter(Boolean)));
  const toInsert = Array.from(new Set((plan.toInsert || []).map((item) => normalizeCode(item)).filter(Boolean)));
  const toDeactivate = Array.from(new Set((plan.toDeactivate || []).map((item) => normalizeCode(item)).filter(Boolean)));

  await tx.begin();

  try {
    for (const mapId of toReactivate) {
      const reactivateReq = new sql.Request(tx);
      await reactivateReq
        .input("map_id", sql.NVarChar(100), mapId)
        .query(`
          UPDATE core_configuracion.sec_component_catalog_map
          SET
            review_status = 'APPROVED',
            is_active = 1,
            updated_at = SYSUTCDATETIME()
          WHERE map_id = @map_id;
        `);
    }

    for (const catalogCode of toInsert) {
      const insertReq = new sql.Request(tx);
      await insertReq
        .input("map_id", sql.NVarChar(100), crypto.randomUUID())
        .input("component_code", sql.NVarChar(120), componentCode)
        .input("catalog_code", sql.NVarChar(120), catalogCode)
        .input("source", sql.NVarChar(120), "CONFIG_COMPONENTS_API")
        .query(`
          INSERT INTO core_configuracion.sec_component_catalog_map (
            map_id,
            component_code,
            catalog_code,
            review_status,
            is_active,
            source,
            created_at,
            updated_at
          )
          VALUES (
            @map_id,
            @component_code,
            @catalog_code,
            'APPROVED',
            1,
            @source,
            SYSUTCDATETIME(),
            SYSUTCDATETIME()
          );
        `);
    }

    if (toDeactivate.length) {
      const deactivateReq = new sql.Request(tx);
      deactivateReq.input("component_code", sql.NVarChar(120), componentCode);

      const placeholders = toDeactivate.map((_, index) => `@catalog_code_${index}`);
      for (const [index, value] of toDeactivate.entries()) {
        deactivateReq.input(`catalog_code_${index}`, sql.NVarChar(120), value);
      }

      await deactivateReq.query(`
        UPDATE core_configuracion.sec_component_catalog_map
        SET
          is_active = 0,
          updated_at = SYSUTCDATETIME()
        WHERE UPPER(component_code) = @component_code
          AND is_active = 1
          AND UPPER(catalog_code) IN (${placeholders.join(", ")});
      `);
    }

    await tx.commit();
    return { applied: (plan?.applied ?? (toReactivate.length + toInsert.length)) };
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}

export async function deleteComponentCatalogMappingCrudDorado(id) {
  const mapId = normalizeText(id);
  if (!mapId) return;

  const pool = await getAppPool();
  await pool
    .request()
    .input("map_id", sql.NVarChar(100), mapId)
    .query(`
      UPDATE core_configuracion.sec_component_catalog_map
      SET
        is_active = 0,
        updated_at = SYSUTCDATETIME()
      WHERE map_id = @map_id;
    `);
}
