import crypto from "node:crypto";
import { getAppPool, sqlType } from "../../db/sql.js";
import { ROLE_PERMISSION_ACTIONS } from "../../domain/configuracion/roleContracts.js";
import { GT_COMPATIBILITY_SCOPE_ID } from "../../domain/gtTenantPolicy.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function toRoleRow(row) {
  return {
    id: String(row.RoleId || ""),
    tenantId: String(row.TenantId || GT_COMPATIBILITY_SCOPE_ID),
    roleCode: String(row.Code || ""),
    roleName: String(row.Name || ""),
    isActive: row.IsActive !== false,
    permissionsCount: Number(row.permissions_count || 0),
    updatedAt: row.UpdatedAt ? String(row.UpdatedAt) : null,
  };
}

const ORDERED_ACTIONS = [
  ROLE_PERMISSION_ACTIONS.VER,
  ROLE_PERMISSION_ACTIONS.EDITAR,
  ROLE_PERMISSION_ACTIONS.REVISAR,
  ROLE_PERMISSION_ACTIONS.APROBAR,
  ROLE_PERMISSION_ACTIONS.ADMINISTRAR,
];

function toActionLabel(actionCode) {
  switch (actionCode) {
    case ROLE_PERMISSION_ACTIONS.VER:
      return "Ver";
    case ROLE_PERMISSION_ACTIONS.EDITAR:
      return "Editar";
    case ROLE_PERMISSION_ACTIONS.REVISAR:
      return "Revisar";
    case ROLE_PERMISSION_ACTIONS.APROBAR:
      return "Aprobar";
    case ROLE_PERMISSION_ACTIONS.ADMINISTRAR:
      return "Administrar";
    default:
      return actionCode;
  }
}

export async function listRolesCrudDorado({ tenantId, includeInactive }) {
  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const pool = await getAppPool();
  const req = pool.request().input("tenant_id", sql.NVarChar(100), normalizedTenantId);

  const where = ["r.TenantId = @tenant_id"];
  if (!includeInactive) where.push("r.IsActive = 1");

  const result = await req.query(`
    SELECT
      r.RoleId,
      r.TenantId,
      r.Code,
      r.Name,
      r.IsActive,
      r.UpdatedAt,
      (
        SELECT COUNT(1)
        FROM core_configuracion.sec_role_permissions p
        WHERE p.role_id = r.RoleId
          AND p.is_active = 1
      ) AS permissions_count
    FROM core_configuracion.sec_roles r
    WHERE ${where.join(" AND ")}
    ORDER BY r.Name ASC, r.Code ASC;
  `);

  return (result.recordset || []).map(toRoleRow);
}

export async function getRoleByIdCrudDorado({ id, tenantId }) {
  const roleId = normalizeText(id);
  if (!roleId) return null;

  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const pool = await getAppPool();

  const headerResult = await pool
    .request()
    .input("role_id", sql.NVarChar(120), roleId)
    .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
    .query(`
      SELECT TOP 1
        RoleId,
        TenantId,
        Code,
        Name,
        IsActive,
        UpdatedAt
      FROM core_configuracion.sec_roles
      WHERE RoleId = @role_id
        AND TenantId = @tenant_id;
    `);

  const header = headerResult.recordset?.[0];
  if (!header) return null;

  const permissionsResult = await pool
    .request()
    .input("role_id", sql.NVarChar(120), roleId)
    .query(`
      SELECT action_code
      FROM core_configuracion.sec_role_permissions
      WHERE role_id = @role_id
        AND is_active = 1
      ORDER BY action_code ASC;
    `);

  return {
    id: String(header.RoleId || ""),
    tenantId: String(header.TenantId || GT_COMPATIBILITY_SCOPE_ID),
    roleCode: String(header.Code || ""),
    roleName: String(header.Name || ""),
    isActive: header.IsActive !== false,
    permissions: (permissionsResult.recordset || []).map((row) => String(row.action_code || "")),
    updatedAt: header.UpdatedAt ? String(header.UpdatedAt) : null,
  };
}

export async function saveRoleCrudDorado(draft) {
  const roleId = normalizeText(draft.id) || crypto.randomUUID();
  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    await new sql.Request(tx)
      .input("role_id", sql.NVarChar(120), roleId)
      .input("tenant_id", sql.NVarChar(100), draft.tenantId)
      .input("code", sql.NVarChar(120), draft.roleCode)
      .input("name", sql.NVarChar(255), draft.roleName)
      .input("is_active", sql.Bit, draft.isActive ? 1 : 0)
      .query(`
        MERGE core_configuracion.sec_roles AS target
        USING (
          SELECT
            @role_id AS RoleId,
            @tenant_id AS TenantId,
            @code AS Code,
            @name AS Name,
            @is_active AS IsActive
        ) AS source
        ON target.RoleId = source.RoleId
        WHEN MATCHED THEN
          UPDATE SET
            target.TenantId = source.TenantId,
            target.Code = source.Code,
            target.Name = source.Name,
            target.IsActive = source.IsActive,
            target.UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (RoleId, TenantId, Code, Name, IsActive, CreatedAt, UpdatedAt)
          VALUES (source.RoleId, source.TenantId, source.Code, source.Name, source.IsActive, SYSUTCDATETIME(), SYSUTCDATETIME());
      `);

    await new sql.Request(tx)
      .input("role_id", sql.NVarChar(120), roleId)
      .query(`
        UPDATE core_configuracion.sec_role_permissions
        SET is_active = 0,
            updated_at = SYSUTCDATETIME()
        WHERE role_id = @role_id;
      `);

    for (const actionCode of draft.permissions) {
      await new sql.Request(tx)
        .input("role_id", sql.NVarChar(120), roleId)
        .input("action_code", sql.NVarChar(255), actionCode)
        .query(`
          MERGE core_configuracion.sec_role_permissions AS target
          USING (
            SELECT @role_id AS role_id, @action_code AS action_code
          ) AS source
          ON target.role_id = source.role_id
             AND target.action_code = source.action_code
          WHEN MATCHED THEN
            UPDATE SET
              target.is_active = 1,
              target.updated_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (role_id, action_code, is_active, created_at, updated_at)
            VALUES (source.role_id, source.action_code, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
        `);
    }

    await tx.commit();
    return roleId;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function deleteRoleCrudDorado({ id, tenantId }) {
  const roleId = normalizeText(id);
  if (!roleId) return 0;

  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const roleResult = await new sql.Request(tx)
      .input("role_id", sql.NVarChar(120), roleId)
      .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
      .query(`
        UPDATE core_configuracion.sec_roles
        SET IsActive = 0,
            UpdatedAt = SYSUTCDATETIME()
        WHERE RoleId = @role_id
          AND TenantId = @tenant_id;
      `);

    await new sql.Request(tx)
      .input("role_id", sql.NVarChar(120), roleId)
      .query(`
        UPDATE core_configuracion.sec_role_permissions
        SET is_active = 0,
            updated_at = SYSUTCDATETIME()
        WHERE role_id = @role_id;
      `);

    await tx.commit();
    return Number(roleResult.rowsAffected?.[0] || 0);
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function listPermissionCatalogCrudDorado({ includeInactive }) {
  const pool = await getAppPool();
  const result = await pool.request().query(`
    SELECT DISTINCT
      module_code,
      area_code,
      COALESCE(dim_label, label, area_code) AS area_label
    FROM core_configuracion.sec_dimensions
    WHERE module_code IS NOT NULL
      AND area_code IS NOT NULL
      AND LTRIM(RTRIM(area_code)) <> ''
      ${includeInactive ? "" : "AND is_active = 1 AND review_status = 'APPROVED'"}
    ORDER BY module_code, area_code;
  `);

  const rows = [];
  for (const area of result.recordset || []) {
    const moduleCode = String(area.module_code || "").trim();
    const areaCode = String(area.area_code || "").trim();
    const areaLabel = String(area.area_label || areaCode || moduleCode).trim();
    if (!moduleCode || !areaCode) continue;

    for (const actionCode of ORDERED_ACTIONS) {
      rows.push({
        actionCode,
        label: `${areaLabel} · ${toActionLabel(actionCode)}`,
        moduleCode,
        areaCode,
        isActive: true,
      });
    }
  }

  return rows;
}
