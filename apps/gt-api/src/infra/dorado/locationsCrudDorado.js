import crypto from "node:crypto";
import { getAppPool, sqlType } from "../../db/sql.js";
import { GT_COMPATIBILITY_SCOPE_ID } from "../../domain/gtTenantPolicy.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "_");
}

function uuidFromSeed(seed) {
  const hex = crypto.createHash("sha1").update(String(seed || "")).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildStatus(isActive) {
  return isActive ? "ACTIVE" : "INACTIVE";
}

function buildPath(parentPath, currentCode) {
  const part = normalizeCode(currentCode);
  return parentPath ? `${parentPath}>${part}` : part;
}

export async function listLocationsCrudDorado({ includeInactive }) {
  const pool = await getAppPool();
  const result = await pool.request().query(`
    SELECT
      COALESCE(location_instancia_id, instancia_id, location_id) AS location_instancia_id,
      COALESCE(tenant_id, '${GT_COMPATIBILITY_SCOPE_ID}') AS tenant_id,
      COALESCE(code, location_code, node_code) AS instance_code,
      COALESCE(name, location_name, node_label) AS instance_name,
      COALESCE(root_location_id, location_id) AS root_location_id,
      COALESCE(is_active, 1) AS is_active,
      updated_at
    FROM core_configuracion.loc_locations
    WHERE (COALESCE(node_kind, 'ROOT') = 'ROOT' OR parent_location_id IS NULL)
    ${includeInactive ? "" : "AND COALESCE(is_active, 1) = 1"}
    ORDER BY instance_code;
  `);

  return (result.recordset || []).map((row) => ({
    id: String(row.location_instancia_id || ""),
    tenantId: String(row.tenant_id || GT_COMPATIBILITY_SCOPE_ID),
    code: String(row.instance_code || ""),
    name: String(row.instance_name || ""),
    rootLocationId: String(row.root_location_id || ""),
    isActive: Number(row.is_active ?? 1) === 1,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }));
}

export async function getLocationByIdCrudDorado(id) {
  const locationId = normalizeText(id);
  if (!locationId) return null;

  const pool = await getAppPool();
  const result = await pool
    .request()
    .input("location_instancia_id", sql.NVarChar(36), locationId)
    .query(`
      SELECT TOP 1
        location_instancia_id,
        tenant_id,
        COALESCE(code, location_code, node_code) AS instance_code,
        COALESCE(name, location_name, node_label) AS instance_name,
        root_location_id,
        is_active
      FROM core_configuracion.loc_locations
      WHERE location_instancia_id = @location_instancia_id
        AND (node_kind = 'ROOT' OR parent_location_id IS NULL);
    `);

  const row = result.recordset?.[0];
  if (!row) return null;

  return {
    id: String(row.location_instancia_id || ""),
    tenantId: String(row.tenant_id || GT_COMPATIBILITY_SCOPE_ID),
    code: String(row.instance_code || ""),
    name: String(row.instance_name || ""),
    rootLocationId: String(row.root_location_id || ""),
    isActive: Number(row.is_active ?? 1) === 1,
    moduleCodes: [],
    leaves: [],
  };
}

export async function listLocationCascadeComponentsCrudDorado({
  instanceId,
  moduleCode,
  areaCodes,
  includeInactive,
}) {
  const normalizedInstanceId = normalizeText(instanceId);
  if (!normalizedInstanceId) return [];

  const normalizedModuleCode = normalizeCode(moduleCode);
  const normalizedAreaCodes = Array.isArray(areaCodes)
    ? areaCodes
        .map((value) => normalizeCode(value))
        .filter((value) => Boolean(value))
    : [];

  const pool = await getAppPool();
  const req = pool
    .request()
    .input("location_instancia_id", sql.NVarChar(36), normalizedInstanceId);

  const whereClauses = [
    "location_instancia_id = @location_instancia_id",
    "node_kind = 'COMPONENT'",
  ];

  if (!includeInactive) {
    whereClauses.push("is_active = 1");
  }

  if (normalizedModuleCode) {
    req.input("module_code", sql.NVarChar(120), normalizedModuleCode);
    whereClauses.push("module_code = @module_code");
  }

  if (normalizedAreaCodes.length) {
    const placeholders = normalizedAreaCodes.map((_, index) => `@area_code_${index}`);
    normalizedAreaCodes.forEach((value, index) => {
      req.input(`area_code_${index}`, sql.NVarChar(120), value);
    });
    whereClauses.push(`area_code IN (${placeholders.join(",")})`);
  }

  const result = await req.query(`
    SELECT
      location_id,
      module_code,
      area_code,
      subarea_code,
      component_code,
      node_label,
      full_path,
      status_code,
      is_active
    FROM core_configuracion.loc_locations
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY module_code, area_code, node_label;
  `);

  return (result.recordset || []).map((row) => ({
    locationId: String(row.location_id || ""),
    moduleCode: String(row.module_code || ""),
    areaCode: String(row.area_code || ""),
    subareaCode: String(row.subarea_code || ""),
    componentCode: String(row.component_code || ""),
    componentLabel: String(row.node_label || row.component_code || ""),
    fullPath: String(row.full_path || ""),
    statusCode: String(row.status_code || ""),
    isActive: Number(row.is_active ?? 1) === 1,
  }));
}

async function purgeLocationCascadeTx(tx, { instanceId, rootLocationId }) {
  const purgeMapReq = new sql.Request(tx);
  await purgeMapReq
    .input("location_instancia_id", sql.NVarChar(36), instanceId)
    .input("root_location_id", sql.NVarChar(36), rootLocationId)
    .query(`
      DELETE FROM core_configuracion.sec_location_component_catalog_map
      WHERE location_id IN (
        SELECT location_id
        FROM core_configuracion.loc_locations
        WHERE location_instancia_id = @location_instancia_id
          AND location_id <> @root_location_id
      );
    `);

  const purgeLocationsReq = new sql.Request(tx);
  const result = await purgeLocationsReq
    .input("location_instancia_id", sql.NVarChar(36), instanceId)
    .input("root_location_id", sql.NVarChar(36), rootLocationId)
    .query(`
      DELETE FROM core_configuracion.loc_locations
      WHERE location_instancia_id = @location_instancia_id
        AND location_id <> @root_location_id;
    `);

  return result.rowsAffected?.[0] || 0;
}

export async function saveLocationAggregateCrudDorado(payload) {
  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);

  const instanceId = normalizeText(payload.id) || crypto.randomUUID();
  const tenantId = normalizeText(payload.tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const code = normalizeCode(payload.code);
  const name = normalizeText(payload.name);
  const isActive = payload.isActive !== false;

  await tx.begin();

  try {
    const readReq = new sql.Request(tx);
    readReq.input("location_instancia_id", sql.NVarChar(36), instanceId);
    const current = await readReq.query(`
      SELECT TOP 1 root_location_id
      FROM core_configuracion.loc_instancias
      WHERE location_instancia_id = @location_instancia_id;
    `);

    const existingRoot = String(current.recordset?.[0]?.root_location_id || "").trim();
    const rootLocationId = existingRoot || crypto.randomUUID();

    const upsertHeaderReq = new sql.Request(tx);
    await upsertHeaderReq
      .input("location_instancia_id", sql.NVarChar(36), instanceId)
      .input("tenant_id", sql.NVarChar(36), tenantId)
      .input("instance_code", sql.NVarChar(100), code)
      .input("instance_name", sql.NVarChar(300), name)
      .input("root_location_id", sql.NVarChar(36), rootLocationId)
      .input("is_active", sql.Bit, isActive ? 1 : 0)
      .query(`
        MERGE core_configuracion.loc_instancias AS tgt
        USING (SELECT @location_instancia_id AS location_instancia_id) AS src
          ON tgt.location_instancia_id = src.location_instancia_id
        WHEN MATCHED THEN
          UPDATE SET
            tenant_id = @tenant_id,
            instance_code = @instance_code,
            instance_name = @instance_name,
            root_location_id = @root_location_id,
            is_active = @is_active,
            updated_at = SYSUTCDATETIME(),
            updated_by = 'gt-api'
        WHEN NOT MATCHED THEN
          INSERT (
            location_instancia_id, tenant_id, instance_code, instance_name,
            root_location_id, is_active, created_at, created_by, updated_at, updated_by
          )
          VALUES (
            @location_instancia_id, @tenant_id, @instance_code, @instance_name,
            @root_location_id, @is_active, SYSUTCDATETIME(), 'gt-api', SYSUTCDATETIME(), 'gt-api'
          );
      `);

    const upsertRootReq = new sql.Request(tx);
    await upsertRootReq
      .input("location_id", sql.NVarChar(36), rootLocationId)
      .input("tenant_id", sql.NVarChar(36), tenantId)
      .input("instancia_id", sql.NVarChar(36), instanceId)
      .input("location_code", sql.NVarChar(100), code)
      .input("location_name", sql.NVarChar(300), name)
      .input("status_code", sql.NVarChar(20), buildStatus(isActive))
      .input("is_active", sql.Bit, isActive ? 1 : 0)
      .input("path_codes", sql.NVarChar(sql.MAX), code)
      .query(`
        MERGE core_configuracion.loc_locations AS tgt
        USING (SELECT @location_id AS location_id) AS src
          ON tgt.location_id = src.location_id
        WHEN MATCHED THEN
          UPDATE SET
            tenant_id = @tenant_id,
            instancia_id = @instancia_id,
            location_instancia_id = @instancia_id,
            root_location_id = @location_id,
            location_code = @location_code,
            location_name = @location_name,
            code = @location_code,
            name = @location_name,
            node_code = @location_code,
            node_label = @location_name,
            node_kind = 'ROOT',
            node_level = 0,
            location_type_code = 'ROOT',
            location_type = 'ROOT',
            parent_id = NULL,
            parent_location_id = NULL,
            parent_node_id = NULL,
            parent_node_code = NULL,
            depth_level = 0,
            path_codes = @path_codes,
            full_path = @path_codes,
            status_code = @status_code,
            is_leaf = 0,
            is_active = @is_active,
            materialized_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME(),
            updated_by = 'gt-api',
            source = 'CONFIG_LOCATIONS_API'
        WHEN NOT MATCHED THEN
          INSERT (
            location_id, tenant_id, instancia_id, location_instancia_id,
            root_location_id, location_code, location_name,
            code, name, node_id, node_code, node_label,
            node_kind, node_level, location_type_code, location_type,
            parent_id, parent_location_id, parent_node_id, parent_node_code,
            depth_level, path_codes, full_path,
            status_code, is_leaf, is_active, materialized_at,
            source, created_at, created_by, updated_at, updated_by
          )
          VALUES (
            @location_id, @tenant_id, @instancia_id, @instancia_id,
            @location_id, @location_code, @location_name,
            @location_code, @location_name, @location_id, @location_code, @location_name,
            'ROOT', 0, 'ROOT', 'ROOT',
            NULL, NULL, NULL, NULL,
            0, @path_codes, @path_codes,
            @status_code, 0, @is_active, SYSUTCDATETIME(),
            'CONFIG_LOCATIONS_API', SYSUTCDATETIME(), 'gt-api', SYSUTCDATETIME(), 'gt-api'
          );
      `);

    await purgeLocationCascadeTx(tx, {
      instanceId,
      rootLocationId,
    });

    const dimsReq = new sql.Request(tx);
    const dimsResult = await dimsReq.query(`
      SELECT
        dimension_id,
        dim_code,
        label,
        dim_type,
        parent_code,
        hierarchy_level,
        module_code,
        area_code,
        subarea_code,
        component_code
      FROM core_configuracion.sec_dimensions
      WHERE is_active = 1
        AND review_status = 'APPROVED'
        AND dim_type IN ('MODULE', 'AREA', 'SUBAREA', 'COMPONENT')
      ORDER BY hierarchy_level ASC, dim_code ASC;
    `);

    const approvedRows = dimsResult.recordset || [];
    const nodeByCode = new Map();
    nodeByCode.set("__ROOT__", {
      locationId: rootLocationId,
      path: normalizeCode(code),
    });

    for (const dim of approvedRows) {
      const dimCode = normalizeCode(dim.dim_code);
      const parentCode = normalizeCode(dim.parent_code);
      const parentNode = nodeByCode.get(parentCode) || nodeByCode.get("__ROOT__");
      const nodeLocationId = uuidFromSeed(`${instanceId}:${dimCode}`);
      const nodeLevel = Number(dim.hierarchy_level || 1);
      const nodeLabel = normalizeText(dim.label) || dimCode;
      const pathCodes = buildPath(parentNode.path, dimCode);

      const upsertNodeReq = new sql.Request(tx);
      await upsertNodeReq
        .input("location_id", sql.NVarChar(36), nodeLocationId)
        .input("tenant_id", sql.NVarChar(36), tenantId)
        .input("instancia_id", sql.NVarChar(36), instanceId)
        .input("root_location_id", sql.NVarChar(36), rootLocationId)
        .input("location_code", sql.NVarChar(100), dimCode)
        .input("location_name", sql.NVarChar(300), nodeLabel)
        .input("parent_id", sql.NVarChar(36), parentNode.locationId)
        .input("depth_level", sql.Int, nodeLevel)
        .input("path_codes", sql.NVarChar(sql.MAX), pathCodes)
        .input("status_code", sql.NVarChar(20), buildStatus(isActive))
        .input("is_active", sql.Bit, isActive ? 1 : 0)
        .input("node_kind", sql.NVarChar(80), normalizeText(dim.dim_type) || "COMPONENT")
        .input("node_level", sql.Int, nodeLevel)
        .input("node_code", sql.NVarChar(200), dimCode)
        .input("node_label", sql.NVarChar(300), nodeLabel)
        .input("parent_node_code", sql.NVarChar(200), parentCode || null)
        .input("full_path", sql.NVarChar(sql.MAX), pathCodes)
        .input("location_type", sql.NVarChar(80), normalizeText(dim.dim_type) || "COMPONENT")
        .input("module_code", sql.NVarChar(120), normalizeCode(dim.module_code) || null)
        .input("area_code", sql.NVarChar(120), normalizeCode(dim.area_code) || null)
        .input("subarea_code", sql.NVarChar(120), normalizeCode(dim.subarea_code) || null)
        .input("component_code", sql.NVarChar(120), normalizeCode(dim.component_code) || null)
        .input("source_dimension_id", sql.NVarChar(200), normalizeText(dim.dimension_id) || null)
        .input("sort_order", sql.Int, nodeLevel)
        .input("source", sql.NVarChar(120), "SEC_DIMENSIONS")
        .query(`
          MERGE core_configuracion.loc_locations AS tgt
          USING (SELECT @location_id AS location_id) AS src
            ON tgt.location_id = src.location_id
          WHEN MATCHED THEN
            UPDATE SET
              tenant_id = @tenant_id,
              instancia_id = @instancia_id,
              location_instancia_id = @instancia_id,
              root_location_id = @root_location_id,
              location_code = @location_code,
              location_name = @location_name,
              code = @location_code,
              name = @location_name,
              parent_id = @parent_id,
              parent_location_id = @parent_id,
              parent_node_id = @parent_id,
              depth_level = @depth_level,
              path_codes = @path_codes,
              status_code = @status_code,
              is_active = @is_active,
              node_id = @location_id,
              node_kind = @node_kind,
              node_level = @node_level,
              node_code = @node_code,
              node_label = @node_label,
              parent_node_code = @parent_node_code,
              full_path = @full_path,
              location_type = @location_type,
              location_type_code = @location_type,
              module_code = @module_code,
              area_code = @area_code,
              subarea_code = @subarea_code,
              component_code = @component_code,
              source_dimension_id = @source_dimension_id,
              sort_order = @sort_order,
              source = @source,
              is_leaf = CASE WHEN @node_kind = 'COMPONENT' THEN 1 ELSE 0 END,
              materialized_at = SYSUTCDATETIME(),
              updated_at = SYSUTCDATETIME(),
              updated_by = 'gt-api'
          WHEN NOT MATCHED THEN
            INSERT (
              location_id, tenant_id, instancia_id, location_instancia_id,
              root_location_id, location_code, location_name,
              code, name, parent_id, parent_location_id, depth_level, path_codes,
              status_code, is_active, node_id, parent_node_id,
              node_kind, node_level, node_code, node_label, parent_node_code,
              full_path, location_type, location_type_code,
              module_code, area_code, subarea_code, component_code,
              source_dimension_id, sort_order, source,
              is_leaf, materialized_at, created_at, created_by, updated_at, updated_by
            )
            VALUES (
              @location_id, @tenant_id, @instancia_id, @instancia_id,
              @root_location_id, @location_code, @location_name,
              @location_code, @location_name, @parent_id, @parent_id, @depth_level, @path_codes,
              @status_code, @is_active, @location_id, @parent_id,
              @node_kind, @node_level, @node_code, @node_label, @parent_node_code,
              @full_path, @location_type, @location_type,
              @module_code, @area_code, @subarea_code, @component_code,
              @source_dimension_id, @sort_order, @source,
              CASE WHEN @node_kind = 'COMPONENT' THEN 1 ELSE 0 END,
              SYSUTCDATETIME(), SYSUTCDATETIME(), 'gt-api', SYSUTCDATETIME(), 'gt-api'
            );
        `);

      nodeByCode.set(dimCode, {
        locationId: nodeLocationId,
        path: pathCodes,
      });
    }
    await tx.commit();
    return instanceId;
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}

export async function deactivateLocationCrudDorado(id) {
  const locationId = normalizeText(id);
  if (!locationId) return;

  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const updateHeaderReq = new sql.Request(tx);
    await updateHeaderReq
      .input("location_instancia_id", sql.NVarChar(36), locationId)
      .query(`
        UPDATE core_configuracion.loc_instancias
        SET
          is_active = 0,
          updated_at = SYSUTCDATETIME(),
          updated_by = 'gt-api'
        WHERE location_instancia_id = @location_instancia_id;
      `);

    const deactivateLocationsReq = new sql.Request(tx);
    await deactivateLocationsReq
      .input("location_instancia_id", sql.NVarChar(36), locationId)
      .query(`
        UPDATE core_configuracion.loc_locations
        SET
          is_active = 0,
          status_code = 'INACTIVE',
          updated_at = SYSUTCDATETIME(),
          updated_by = 'gt-api'
        WHERE location_instancia_id = @location_instancia_id;
      `);

    const deactivateMapReq = new sql.Request(tx);
    await deactivateMapReq
      .input("location_instancia_id", sql.NVarChar(200), locationId)
      .query(`
        UPDATE core_configuracion.sec_location_component_catalog_map
        SET
          is_active = 0,
          updated_at = SYSUTCDATETIME()
        WHERE location_id IN (
             SELECT location_id
             FROM core_configuracion.loc_locations
             WHERE location_instancia_id = @location_instancia_id
           );
      `);

    await tx.commit();
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}

export async function purgeLocationCascadeCrudDorado(id) {
  const instanceId = normalizeText(id);
  if (!instanceId) return 0;

  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const rootReq = new sql.Request(tx);
    const rootResult = await rootReq
      .input("location_instancia_id", sql.NVarChar(36), instanceId)
      .query(`
        SELECT TOP 1 root_location_id
        FROM core_configuracion.loc_instancias
        WHERE location_instancia_id = @location_instancia_id;
      `);

    const rootLocationId = normalizeText(
      rootResult.recordset?.[0]?.root_location_id,
    );
    if (!rootLocationId) {
      await tx.rollback();
      return 0;
    }

    const purged = await purgeLocationCascadeTx(tx, {
      instanceId,
      rootLocationId,
    });

    await tx.commit();
    return purged;
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}

export async function bulkSetLocationNodesActiveCrudDorado({
  instanceId,
  locationIds,
  isActive,
}) {
  const normalizedInstanceId = normalizeText(instanceId);
  if (!normalizedInstanceId) return 0;

  const normalizedIds = Array.isArray(locationIds)
    ? locationIds.map((value) => normalizeText(value)).filter((value) => Boolean(value))
    : [];
  if (!normalizedIds.length) return 0;

  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const statusCode = isActive ? "ACTIVE" : "INACTIVE";
    const req = new sql.Request(tx)
      .input("location_instancia_id", sql.NVarChar(36), normalizedInstanceId)
      .input("is_active", sql.Bit, isActive ? 1 : 0)
      .input("status_code", sql.NVarChar(20), statusCode);

    const placeholders = normalizedIds.map((_, index) => `@location_id_${index}`);
    normalizedIds.forEach((value, index) => {
      req.input(`location_id_${index}`, sql.NVarChar(36), value);
    });

    const updateNodesResult = await req.query(`
      UPDATE core_configuracion.loc_locations
      SET
        is_active = @is_active,
        status_code = @status_code,
        updated_at = SYSUTCDATETIME(),
        updated_by = 'gt-api'
      WHERE location_instancia_id = @location_instancia_id
        AND node_kind = 'COMPONENT'
        AND location_id IN (${placeholders.join(",")});

      UPDATE core_configuracion.sec_location_component_catalog_map
      SET
        is_active = @is_active,
        updated_at = SYSUTCDATETIME()
      WHERE location_id IN (${placeholders.join(",")});
    `);

    await tx.commit();
    return updateNodesResult.rowsAffected?.[0] || 0;
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}

export async function rematerializeActiveLocationInstancesCrudDorado() {
  const pool = await getAppPool();
  const result = await pool.request().query(`
    SELECT
      location_instancia_id,
      tenant_id,
      instance_code,
      instance_name
    FROM core_configuracion.loc_instancias
    WHERE is_active = 1
    ORDER BY instance_code;
  `);

  const activeInstances = result.recordset || [];
  let rematerialized = 0;
  const instanceIds = [];

  for (const row of activeInstances) {
    const instanceId = normalizeText(row.location_instancia_id);
    const tenantId = normalizeText(row.tenant_id) || GT_COMPATIBILITY_SCOPE_ID;
    const code = normalizeCode(row.instance_code);
    const name = normalizeText(row.instance_name) || code;

    if (!instanceId || !code) continue;

    await saveLocationAggregateCrudDorado({
      id: instanceId,
      tenantId,
      code,
      name,
      isActive: true,
      moduleCodes: [],
    });

    rematerialized += 1;
    instanceIds.push(instanceId);
  }

  return {
    rematerialized,
    instanceIds,
  };
}
