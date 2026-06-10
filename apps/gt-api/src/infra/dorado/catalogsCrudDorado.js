import crypto from "node:crypto";
import { getAppPool, sqlType } from "../../db/sql.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "_");
}

function buildRuleKey(kind, code) {
  return `${String(kind || "").toUpperCase()}:${normalizeCode(code)}`;
}

function parseRuleKey(value) {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return null;
  if (!raw.startsWith("TYPE:") && !raw.startsWith("CODE:")) return null;
  const kind = raw.slice(0, 4);
  const code = normalizeCode(raw.slice(5));
  if (!code) return null;
  return { kind, code, key: `${kind}:${code}` };
}

async function getAreaModuleMap(tx) {
  const req = new sql.Request(tx);
  const result = await req.query(`
    SELECT
      UPPER(COALESCE(NULLIF(area_code, ''), NULLIF(dim_code, ''))) AS area_code,
      UPPER(COALESCE(NULLIF(module_code, ''),
        CASE
          WHEN CHARINDEX('.', dim_code) > 0 THEN LEFT(dim_code, CHARINDEX('.', dim_code) - 1)
          ELSE dim_code
        END
      )) AS module_code
    FROM core_configuracion.sec_dimensions
    WHERE is_active = 1
      AND review_status = 'APPROVED'
      AND dim_type = 'AREA';
  `);

  const map = new Map();
  for (const row of result.recordset || []) {
    const areaCode = normalizeCode(row.area_code);
    const moduleCode = normalizeCode(row.module_code);
    if (!areaCode || !moduleCode) continue;
    map.set(areaCode, moduleCode);
  }
  return map;
}

async function ensureTypeRule(tx, catalogId, moduleCode, isActive) {
  const safeCatalogId = normalizeText(catalogId);
  const safeModuleCode = normalizeCode(moduleCode);

  const lookupReq = new sql.Request(tx);
  const lookup = await lookupReq
    .input("catalog_id", sql.NVarChar(100), safeCatalogId)
    .input("rule_code", sql.NVarChar(120), safeModuleCode)
    .query(`
      SELECT TOP 1 rule_id
      FROM core_configuracion.cat_catalogo_rules
      WHERE catalog_id = @catalog_id
        AND rule_kind = 'TYPE'
        AND rule_code = @rule_code;
    `);

  const existingRuleId = String(lookup.recordset?.[0]?.rule_id || "").trim();
  if (existingRuleId) {
    const updateReq = new sql.Request(tx);
    await updateReq
      .input("rule_id", sql.NVarChar(100), existingRuleId)
      .input("rule_scope", sql.NVarChar(60), safeModuleCode)
      .input("is_active", sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE core_configuracion.cat_catalogo_rules
        SET
          parent_rule_id = NULL,
          parent_rule_id_norm = '',
          rule_scope = @rule_scope,
          sort_order = 0,
          is_active = @is_active,
          updated_at = SYSUTCDATETIME()
        WHERE rule_id = @rule_id;
      `);
    return existingRuleId;
  }

  const ruleId = crypto.randomUUID();
  const insertReq = new sql.Request(tx);
  await insertReq
    .input("rule_id", sql.NVarChar(100), ruleId)
    .input("catalog_id", sql.NVarChar(100), safeCatalogId)
    .input("rule_scope", sql.NVarChar(60), safeModuleCode)
    .input("rule_kind", sql.NVarChar(20), "TYPE")
    .input("rule_code", sql.NVarChar(120), safeModuleCode)
    .input("is_active", sql.Bit, isActive ? 1 : 0)
    .query(`
      INSERT INTO core_configuracion.cat_catalogo_rules (
        rule_id, catalog_id, parent_rule_id, rule_scope, rule_kind,
        rule_code, is_active, sort_order, created_at, updated_at, parent_rule_id_norm
      )
      VALUES (
        @rule_id, @catalog_id, NULL, @rule_scope, @rule_kind,
        @rule_code, @is_active, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), ''
      );
    `);

  return ruleId;
}

async function upsertCodeRule(tx, { catalogId, moduleCode, areaCode, parentRuleId, isActive }) {
  const safeCatalogId = normalizeText(catalogId);
  const safeModuleCode = normalizeCode(moduleCode);
  const safeAreaCode = normalizeCode(areaCode);

  const lookupReq = new sql.Request(tx);
  const lookup = await lookupReq
    .input("catalog_id", sql.NVarChar(100), safeCatalogId)
    .input("rule_code", sql.NVarChar(120), safeAreaCode)
    .query(`
      SELECT TOP 1 rule_id
      FROM core_configuracion.cat_catalogo_rules
      WHERE catalog_id = @catalog_id
        AND rule_kind = 'CODE'
        AND rule_code = @rule_code;
    `);

  const existingRuleId = String(lookup.recordset?.[0]?.rule_id || "").trim();
  if (existingRuleId) {
    const updateReq = new sql.Request(tx);
    await updateReq
      .input("rule_id", sql.NVarChar(100), existingRuleId)
      .input("parent_rule_id", sql.NVarChar(100), parentRuleId || null)
      .input("rule_scope", sql.NVarChar(60), safeModuleCode)
      .input("is_active", sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE core_configuracion.cat_catalogo_rules
        SET
          parent_rule_id = @parent_rule_id,
          parent_rule_id_norm = COALESCE(@parent_rule_id, ''),
          rule_scope = @rule_scope,
          sort_order = 10,
          is_active = @is_active,
          updated_at = SYSUTCDATETIME()
        WHERE rule_id = @rule_id;
      `);
    return;
  }

  const ruleId = crypto.randomUUID();
  const insertReq = new sql.Request(tx);
  await insertReq
    .input("rule_id", sql.NVarChar(100), ruleId)
    .input("catalog_id", sql.NVarChar(100), safeCatalogId)
    .input("parent_rule_id", sql.NVarChar(100), parentRuleId || null)
    .input("rule_scope", sql.NVarChar(60), safeModuleCode)
    .input("rule_kind", sql.NVarChar(20), "CODE")
    .input("rule_code", sql.NVarChar(120), safeAreaCode)
    .input("is_active", sql.Bit, isActive ? 1 : 0)
    .query(`
      INSERT INTO core_configuracion.cat_catalogo_rules (
        rule_id, catalog_id, parent_rule_id, rule_scope, rule_kind,
        rule_code, is_active, sort_order, created_at, updated_at, parent_rule_id_norm
      )
      VALUES (
        @rule_id, @catalog_id, @parent_rule_id, @rule_scope, @rule_kind,
        @rule_code, @is_active, 10, SYSUTCDATETIME(), SYSUTCDATETIME(), COALESCE(@parent_rule_id, '')
      );
    `);
}

async function listActiveRuleKeys(pool, catalogId) {
  const safeCatalogId = normalizeText(catalogId);
  if (!safeCatalogId) return new Set();

  const req = pool.request();
  req.input("catalog_id", sql.NVarChar(100), safeCatalogId);

  const result = await req.query(`
    SELECT rule_kind, rule_code
    FROM core_configuracion.cat_catalogo_rules
    WHERE catalog_id = @catalog_id
      AND is_active = 1;
  `);

  const keys = new Set();
  for (const row of result.recordset || []) {
    const kind = String(row.rule_kind || "").toUpperCase();
    const code = normalizeCode(row.rule_code);
    if (!kind || !code) continue;
    keys.add(`${kind}:${code}`);
  }
  return keys;
}

function toCatalogSummary(row) {
  return {
    id: String(row.catalog_id || ""),
    code: String(row.code || ""),
    name: String(row.name || ""),
    isActive: Number(row.is_active ?? 1) === 1,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

export async function listCatalogsCrudDorado({ includeInactive }) {
  const pool = await getAppPool();
  const result = await pool.request().query(`
    SELECT
      catalog_id,
      code,
      name,
      is_active,
      updated_at
    FROM core_configuracion.cat_catalogos
    ${includeInactive ? "" : "WHERE is_active = 1"}
    ORDER BY code;
  `);

  return (result.recordset || []).map(toCatalogSummary);
}

export async function getCatalogByIdCrudDorado(id) {
  const catalogId = normalizeText(id);
  if (!catalogId) return null;

  const pool = await getAppPool();
  const result = await pool
    .request()
    .input("catalog_id", sql.NVarChar(36), catalogId)
    .query(`
      SELECT TOP 1
        catalog_id,
        code,
        name,
        is_active,
        updated_at
      FROM core_configuracion.cat_catalogos
      WHERE catalog_id = @catalog_id;
    `);

  const row = result.recordset?.[0];
  return row ? toCatalogSummary(row) : null;
}

export async function saveCatalogCrudDorado(payload) {
  const pool = await getAppPool();
  const catalogId = normalizeText(payload.id) || crypto.randomUUID();
  const code = normalizeCode(payload.code);
  const name = normalizeText(payload.name);
  const isActive = payload.isActive !== false;

  await pool
    .request()
    .input("catalog_id", sql.NVarChar(100), catalogId)
    .input("code", sql.NVarChar(120), code)
    .input("name", sql.NVarChar(300), name)
    .input("is_active", sql.Bit, isActive ? 1 : 0)
    .query(`
      MERGE core_configuracion.cat_catalogos AS tgt
      USING (SELECT @catalog_id AS catalog_id) AS src
        ON tgt.catalog_id = src.catalog_id
      WHEN MATCHED THEN
        UPDATE SET
          code = @code,
          name = @name,
          sort_order = COALESCE(tgt.sort_order, 0),
          is_active = @is_active,
          updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (
          catalog_id, code, name, sort_order, is_active, created_at, updated_at
        )
        VALUES (
          @catalog_id, @code, @name, 0, @is_active, SYSUTCDATETIME(), SYSUTCDATETIME()
        );
    `);

  return catalogId;
}

export async function deleteCatalogCrudDorado(id) {
  const catalogId = normalizeText(id);
  if (!catalogId) return;

  const pool = await getAppPool();
  await pool
    .request()
    .input("catalog_id", sql.NVarChar(100), catalogId)
    .query(`
      UPDATE core_configuracion.cat_catalogos
      SET
        is_active = 0,
        updated_at = SYSUTCDATETIME()
      WHERE catalog_id = @catalog_id;
    `);

  await pool
    .request()
    .input("catalog_id", sql.NVarChar(100), catalogId)
    .query(`
      UPDATE core_configuracion.cat_catalogo_rules
      SET
        is_active = 0,
        updated_at = SYSUTCDATETIME()
      WHERE catalog_id = @catalog_id;
    `);
}

export async function getModuleTabsCrudDorado() {
  const pool = await getAppPool();
  const result = await pool.request().query(`
    SELECT DISTINCT
      UPPER(COALESCE(NULLIF(module_code, ''), NULLIF(dim_code, ''))) AS module_code
    FROM core_configuracion.sec_dimensions
    WHERE is_active = 1
      AND review_status = 'APPROVED'
      AND dim_type = 'MODULE'
      AND COALESCE(NULLIF(module_code, ''), NULLIF(dim_code, '')) IS NOT NULL
    ORDER BY module_code;
  `);

  const tabs = [{ label: "Todos", value: "__ALL__" }];
  for (const row of result.recordset || []) {
    const code = normalizeCode(row.module_code);
    if (!code) continue;
    tabs.push({ label: code, value: code });
  }
  return tabs;
}

export async function getCatalogRuleChecklistCrudDorado(catalogId, moduleFilter) {
  const pool = await getAppPool();
  const selectedModule = normalizeCode(moduleFilter);
  const activeRuleKeys = await listActiveRuleKeys(pool, catalogId);

  const dims = await pool.request().query(`
    SELECT
      dim_type,
      dim_code,
      label,
      module_code,
      area_code,
      hierarchy_level
    FROM core_configuracion.sec_dimensions
    WHERE is_active = 1
      AND review_status = 'APPROVED'
      AND dim_type IN ('MODULE', 'AREA')
    ORDER BY hierarchy_level ASC, dim_code ASC;
  `);

  const moduleMap = new Map();
  const areaRows = [];

  for (const row of dims.recordset || []) {
    const dimType = String(row.dim_type || "").toUpperCase();
    const dimCode = normalizeCode(row.dim_code);
    const moduleCode = normalizeCode(row.module_code) || normalizeCode(dimCode.split(".")[0]);
    const label = normalizeText(row.label) || dimCode;

    if (dimType === "MODULE") {
      if (!moduleCode) continue;
      moduleMap.set(moduleCode, {
        moduleCode,
        label,
      });
      continue;
    }

    if (dimType === "AREA") {
      const areaCode = normalizeCode(row.area_code) || dimCode;
      if (!moduleCode || !areaCode) continue;
      areaRows.push({
        moduleCode,
        areaCode,
        label,
      });
      if (!moduleMap.has(moduleCode)) {
        moduleMap.set(moduleCode, {
          moduleCode,
          label: moduleCode,
        });
      }
    }
  }

  const moduleCodes = Array.from(moduleMap.keys()).sort();
  const items = [];

  for (const moduleCode of moduleCodes) {
    if (selectedModule && selectedModule !== "__ALL__" && selectedModule !== moduleCode) {
      continue;
    }

    const moduleInfo = moduleMap.get(moduleCode);
    const moduleKey = buildRuleKey("TYPE", moduleCode);

    items.push({
      key: moduleKey,
      title: moduleInfo?.label || moduleCode,
      subtitle: `Modulo ${moduleCode}`,
      quantity: "",
      unit: "",
      checked: activeRuleKeys.has(moduleKey),
      level: 0,
      kind: "type",
      moduleCode,
      areaCode: null,
    });

    const moduleAreas = areaRows
      .filter((item) => item.moduleCode === moduleCode)
      .sort((a, b) => String(a.areaCode).localeCompare(String(b.areaCode)));

    for (const area of moduleAreas) {
      const areaKey = buildRuleKey("CODE", area.areaCode);
      items.push({
        key: areaKey,
        title: area.label || area.areaCode,
        subtitle: area.areaCode,
        quantity: "",
        unit: "",
        checked: activeRuleKeys.has(areaKey),
        level: 1,
        kind: "code",
        moduleCode,
        areaCode: area.areaCode,
      });
    }
  }

  return items;
}

export async function applyCatalogRulesCrudDorado(catalogId, ruleStates) {
  const safeCatalogId = normalizeText(catalogId);
  if (!safeCatalogId) {
    throw new Error("Catalog id es requerido para aplicar rules");
  }

  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const areaModuleMap = await getAreaModuleMap(tx);
    let applied = 0;

    const parsedEntries = Object.entries(ruleStates || [])
      .map(([rawKey, checked]) => ({
        parsed: parseRuleKey(rawKey),
        checked: Boolean(checked),
      }))
      .filter((item) => item.parsed);

    const checkedCodesByModule = new Map();
    for (const entry of parsedEntries) {
      if (entry.parsed.kind !== "CODE" || !entry.checked) continue;
      const moduleCode = areaModuleMap.get(entry.parsed.code);
      if (!moduleCode) continue;
      if (!checkedCodesByModule.has(moduleCode)) {
        checkedCodesByModule.set(moduleCode, new Set());
      }
      checkedCodesByModule.get(moduleCode).add(entry.parsed.code);
    }

    for (const entry of parsedEntries) {
      if (entry.parsed.kind !== "TYPE") continue;
      const moduleCode = entry.parsed.code;
      const hasCheckedChildCode = (checkedCodesByModule.get(moduleCode)?.size || 0) > 0;
      const typeIsActive = entry.checked || hasCheckedChildCode;
      await ensureTypeRule(tx, safeCatalogId, moduleCode, typeIsActive);
      applied += 1;
    }

    for (const entry of parsedEntries) {
      if (entry.parsed.kind !== "CODE") continue;

      const moduleCode = areaModuleMap.get(entry.parsed.code) || "__UNKNOWN__";
      const parentRuleId = await ensureTypeRule(tx, safeCatalogId, moduleCode, entry.checked);
      await upsertCodeRule(tx, {
        catalogId: safeCatalogId,
        moduleCode,
        areaCode: entry.parsed.code,
        parentRuleId,
        isActive: entry.checked,
      });

      applied += 1;
    }

    await tx.commit();
    return { applied };
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}
