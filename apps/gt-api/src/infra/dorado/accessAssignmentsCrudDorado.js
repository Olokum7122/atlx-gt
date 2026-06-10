import crypto from "node:crypto";
import { getAppPool, sqlType } from "../../db/sql.js";
import { GT_COMPATIBILITY_SCOPE_ID } from "../../domain/gtTenantPolicy.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function uuidFromSeed(seed) {
  const hex = crypto
    .createHash("sha1")
    .update(String(seed || ""))
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildSnapshotHash(locationIds = []) {
  const normalized = [...locationIds]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort();
  return crypto.createHash("sha1").update(normalized.join("|")).digest("hex");
}

function buildComponentMap(selectedComponents = []) {
  const map = new Map();
  for (const item of selectedComponents) {
    const locationId = normalizeText(item?.locationId);
    if (!locationId) continue;
    map.set(locationId, {
      moduleCode: normalizeText(item?.moduleCode),
      areaCode: normalizeText(item?.areaCode),
      componentLabel: normalizeText(item?.componentLabel),
    });
  }
  return map;
}

export async function resolveAccessAssignmentContextCrudDorado({
  tenantId,
  userKey,
  roleKey,
  inventoryId,
  locationIds,
}) {
  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const normalizedUserKey = normalizeText(userKey);
  const normalizedRoleKey = normalizeText(roleKey);
  const normalizedInventoryId = normalizeText(inventoryId);
  const normalizedLocationIds = Array.from(
    new Set((locationIds || []).map((value) => normalizeText(value)).filter(Boolean)),
  );

  const pool = await getAppPool();

  const userResult = await pool
    .request()
    .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
    .input("user_key", sql.NVarChar(120), normalizedUserKey)
    .query(`
      SELECT TOP 1 UserId
      FROM core_configuracion.sec_users
      WHERE TenantId = @tenant_id
        AND IsActive = 1
        AND (UserId = @user_key OR UserName = @user_key);
    `);
  const userId = normalizeText(userResult.recordset?.[0]?.UserId);

  const roleResult = await pool
    .request()
    .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
    .input("role_key", sql.NVarChar(120), normalizedRoleKey)
    .query(`
      SELECT TOP 1 RoleId
      FROM core_configuracion.sec_roles
      WHERE TenantId = @tenant_id
        AND IsActive = 1
        AND (RoleId = @role_key OR Code = @role_key);
    `);
  const roleId = normalizeText(roleResult.recordset?.[0]?.RoleId);

  const inventoryResult = await pool
    .request()
    .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
    .input("location_instancia_id", sql.NVarChar(36), normalizedInventoryId)
    .query(`
      SELECT TOP 1 location_instancia_id
      FROM core_configuracion.loc_locations
      WHERE location_instancia_id = @location_instancia_id
        AND tenant_id = @tenant_id
        AND is_active = 1
        AND (node_kind = 'ROOT' OR parent_location_id IS NULL);
    `);
  const resolvedInventoryId = normalizeText(
    inventoryResult.recordset?.[0]?.location_instancia_id,
  );

  const activeLocationIds = new Set();
  if (resolvedInventoryId && normalizedLocationIds.length) {
    const req = pool
      .request()
      .input("location_instancia_id", sql.NVarChar(36), resolvedInventoryId);

    const placeholders = normalizedLocationIds.map((_, index) => `@location_id_${index}`);
    normalizedLocationIds.forEach((value, index) => {
      req.input(`location_id_${index}`, sql.NVarChar(200), value);
    });

    const locationsResult = await req.query(`
      SELECT location_id
      FROM core_configuracion.loc_locations
      WHERE location_instancia_id = @location_instancia_id
        AND node_kind = 'COMPONENT'
        AND is_active = 1
        AND location_id IN (${placeholders.join(",")});
    `);

    for (const row of locationsResult.recordset || []) {
      const locationId = normalizeText(row.location_id);
      if (locationId) activeLocationIds.add(locationId);
    }
  }

  return {
    userId,
    roleId,
    inventoryId: resolvedInventoryId,
    allowedLocationIds: normalizedLocationIds.filter((value) => activeLocationIds.has(value)),
  };
}

export async function listAccessAssignmentsCrudDorado({ tenantId, includeInactive }) {
  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const pool = await getAppPool();
  const req = pool.request().input("tenant_id", sql.NVarChar(36), normalizedTenantId);

  const whereClauses = [
    "a.tenant_id = @tenant_id",
    "a.access_mode = 'CASCADE'",
  ];
  if (!includeInactive) {
    whereClauses.push("a.is_active = 1");
  }

  const result = await req.query(`
    SELECT
      a.user_profile_access_id,
      a.tenant_id,
      a.user_id,
      a.profile_id,
      a.access_id,
      a.is_active,
      a.created_at,
      a.updated_at,
      COALESCE(li.name, li.location_name, li.node_label) AS inventory_name,
      COALESCE(li.code, li.location_code, li.node_code) AS inventory_code,
      (
        SELECT COUNT(1)
        FROM core_configuracion.sec_user_profile_access_detail d
        WHERE d.user_profile_access_id = a.user_profile_access_id
          AND d.is_active = 1
      ) AS components_count
    FROM core_configuracion.sec_user_profile_access a
    LEFT JOIN core_configuracion.loc_locations li
      ON li.location_instancia_id = a.access_id
     AND (li.node_kind = 'ROOT' OR li.parent_location_id IS NULL)
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY COALESCE(a.updated_at, a.created_at) DESC;
  `);

  return (result.recordset || []).map((row) => ({
    id: String(row.user_profile_access_id || ""),
    tenantId: String(row.tenant_id || GT_COMPATIBILITY_SCOPE_ID),
    userName: String(row.user_id || ""),
    profileCode: String(row.profile_id || ""),
    inventoryId: String(row.access_id || ""),
    inventoryName: String(row.inventory_name || row.access_id || ""),
    inventoryCode: String(row.inventory_code || ""),
    componentsCount: Number(row.components_count || 0),
    isActive: row.is_active !== false,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }));
}

export async function getAccessAssignmentByIdCrudDorado({ id, tenantId }) {
  const normalizedId = normalizeText(id);
  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  if (!normalizedId) return null;

  const pool = await getAppPool();

  const headerResult = await pool
    .request()
    .input("user_profile_access_id", sql.NVarChar(120), normalizedId)
    .input("tenant_id", sql.NVarChar(36), normalizedTenantId)
    .query(`
      SELECT TOP 1
        a.user_profile_access_id,
        a.tenant_id,
        a.user_id,
        a.profile_id,
        a.access_id,
        a.is_active,
        COALESCE(li.name, li.location_name, li.node_label) AS inventory_name,
        COALESCE(li.code, li.location_code, li.node_code) AS inventory_code
      FROM core_configuracion.sec_user_profile_access a
      LEFT JOIN core_configuracion.loc_locations li
        ON li.location_instancia_id = a.access_id
       AND (li.node_kind = 'ROOT' OR li.parent_location_id IS NULL)
      WHERE a.user_profile_access_id = @user_profile_access_id
        AND a.tenant_id = @tenant_id;
    `);

  const header = headerResult.recordset?.[0];
  if (!header) return null;

  const detailResult = await pool
    .request()
    .input("user_profile_access_id", sql.NVarChar(120), normalizedId)
    .query(`
      SELECT
        node_id,
        module_code,
        area_code,
        node_label
      FROM core_configuracion.sec_user_profile_access_detail
      WHERE user_profile_access_id = @user_profile_access_id
        AND is_active = 1
      ORDER BY created_at;
    `);

  const details = (detailResult.recordset || []).map((row) => ({
    locationId: String(row.node_id || ""),
    moduleCode: String(row.module_code || ""),
    areaCode: String(row.area_code || ""),
    componentLabel: String(row.node_label || ""),
  }));

  return {
    id: String(header.user_profile_access_id || ""),
    tenantId: String(header.tenant_id || GT_COMPATIBILITY_SCOPE_ID),
    userName: String(header.user_id || ""),
    profileCode: String(header.profile_id || ""),
    inventoryId: String(header.access_id || ""),
    inventoryName: String(header.inventory_name || header.access_id || ""),
    inventoryCode: String(header.inventory_code || ""),
    isActive: header.is_active !== false,
    locationIds: details.map((item) => item.locationId),
    selectedComponents: details,
  };
}

export async function saveAccessAssignmentCrudDorado(draft) {
  const id = normalizeText(draft.id) || uuidFromSeed(`${draft.userName}:${draft.profileCode}:${Date.now()}`);
  const tenantId = normalizeText(draft.tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const snapshotHash = buildSnapshotHash(draft.locationIds);
  const snapshotJson = JSON.stringify(draft.selectedComponents || []);
  const componentMap = buildComponentMap(draft.selectedComponents);

  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    await new sql.Request(tx)
      .input("user_profile_access_id", sql.NVarChar(120), id)
      .input("tenant_id", sql.NVarChar(36), tenantId)
      .input("user_id", sql.NVarChar(120), draft.userName)
      .input("profile_id", sql.NVarChar(120), draft.profileCode)
      .input("access_id", sql.NVarChar(120), draft.inventoryId)
      .input("access_label", sql.NVarChar(300), `${draft.userName} :: ${draft.profileCode}`)
      .input("snapshot_json", sql.NVarChar(sql.MAX), snapshotJson)
      .input("snapshot_hash", sql.NVarChar(120), snapshotHash)
      .query(`
        MERGE core_configuracion.sec_user_profile_access AS target
        USING (
          SELECT
            @user_profile_access_id AS user_profile_access_id,
            @tenant_id AS tenant_id,
            @user_id AS user_id,
            @profile_id AS profile_id,
            @access_id AS access_id,
            @access_label AS access_label,
            @snapshot_json AS snapshot_json,
            @snapshot_hash AS snapshot_hash
        ) AS source
        ON target.user_profile_access_id = source.user_profile_access_id
        WHEN MATCHED THEN
          UPDATE SET
            tenant_id = source.tenant_id,
            user_id = source.user_id,
            profile_id = source.profile_id,
            access_id = source.access_id,
            access_label = source.access_label,
            access_mode = 'CASCADE',
            grants_all_access = 0,
            snapshot_json = source.snapshot_json,
            snapshot_hash = source.snapshot_hash,
            is_active = 1,
            updated_at = SYSUTCDATETIME(),
            updated_by = 'gt-api'
        WHEN NOT MATCHED THEN
          INSERT (
            user_profile_access_id,
            access_id,
            tenant_id,
            user_id,
            profile_id,
            access_label,
            access_mode,
            grants_all_access,
            snapshot_json,
            snapshot_hash,
            is_active,
            created_at,
            updated_at,
            created_by,
            updated_by
          )
          VALUES (
            source.user_profile_access_id,
            source.access_id,
            source.tenant_id,
            source.user_id,
            source.profile_id,
            source.access_label,
            'CASCADE',
            0,
            source.snapshot_json,
            source.snapshot_hash,
            1,
            SYSUTCDATETIME(),
            SYSUTCDATETIME(),
            'gt-api',
            'gt-api'
          );
      `);

    await new sql.Request(tx)
      .input("user_profile_access_id", sql.NVarChar(120), id)
      .query(`
        DELETE FROM core_configuracion.sec_user_profile_access_detail
        WHERE user_profile_access_id = @user_profile_access_id;
      `);

    for (const locationId of draft.locationIds) {
      const metadata = componentMap.get(locationId) || {};
      const moduleCode = normalizeText(metadata.moduleCode);
      const areaCode = normalizeText(metadata.areaCode);
      const componentLabel = normalizeText(metadata.componentLabel) || locationId;
      const fullPath = [moduleCode, areaCode, componentLabel].filter(Boolean).join(" > ");

      await new sql.Request(tx)
        .input(
          "access_detail_id",
          sql.NVarChar(120),
          uuidFromSeed(`${id}:${locationId}:${Date.now()}:${Math.random()}`),
        )
        .input("access_id", sql.NVarChar(120), draft.inventoryId)
        .input("user_profile_access_id", sql.NVarChar(120), id)
        .input("tenant_id", sql.NVarChar(36), tenantId)
        .input("user_id", sql.NVarChar(120), draft.userName)
        .input("profile_id", sql.NVarChar(120), draft.profileCode)
        .input("node_id", sql.NVarChar(200), locationId)
        .input("node_kind", sql.NVarChar(80), "COMPONENT")
        .input("node_level", sql.Int, 4)
        .input("node_code", sql.NVarChar(200), locationId)
        .input("node_label", sql.NVarChar(300), componentLabel)
        .input("module_code", sql.NVarChar(120), moduleCode || null)
        .input("area_code", sql.NVarChar(120), areaCode || null)
        .input("source", sql.NVarChar(120), "GT_WEB")
        .input("full_path", sql.NVarChar(500), fullPath || componentLabel)
        .query(`
          INSERT INTO core_configuracion.sec_user_profile_access_detail (
            access_detail_id,
            access_id,
            user_profile_access_id,
            tenant_id,
            user_id,
            profile_id,
            node_id,
            parent_node_id,
            node_kind,
            node_level,
            node_code,
            node_label,
            module_code,
            area_code,
            subarea_code,
            component_code,
            catalog_code,
            is_leaf,
            is_active,
            source,
            created_at,
            module_id,
            area_id,
            subarea_id,
            component_id,
            catalog_id,
            parent_node_code,
            is_enabled,
            can_view,
            can_create,
            can_edit,
            can_delete,
            can_execute,
            full_path
          )
          VALUES (
            @access_detail_id,
            @access_id,
            @user_profile_access_id,
            @tenant_id,
            @user_id,
            @profile_id,
            @node_id,
            NULL,
            @node_kind,
            @node_level,
            @node_code,
            @node_label,
            @module_code,
            @area_code,
            NULL,
            NULL,
            NULL,
            1,
            1,
            @source,
            SYSUTCDATETIME(),
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            1,
            1,
            0,
            0,
            0,
            0,
            @full_path
          );
        `);
    }

    await tx.commit();
    return id;
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}

export async function deleteAccessAssignmentCrudDorado({ id, tenantId }) {
  const normalizedId = normalizeText(id);
  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  if (!normalizedId) return 0;

  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const headerResult = await new sql.Request(tx)
      .input("user_profile_access_id", sql.NVarChar(120), normalizedId)
      .input("tenant_id", sql.NVarChar(36), normalizedTenantId)
      .query(`
        UPDATE core_configuracion.sec_user_profile_access
        SET
          is_active = 0,
          updated_at = SYSUTCDATETIME(),
          updated_by = 'gt-api'
        WHERE user_profile_access_id = @user_profile_access_id
          AND tenant_id = @tenant_id;
      `);

    await new sql.Request(tx)
      .input("user_profile_access_id", sql.NVarChar(120), normalizedId)
      .query(`
        UPDATE core_configuracion.sec_user_profile_access_detail
        SET is_active = 0
        WHERE user_profile_access_id = @user_profile_access_id;
      `);

    await tx.commit();
    return Number(headerResult.rowsAffected?.[0] || 0);
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}
