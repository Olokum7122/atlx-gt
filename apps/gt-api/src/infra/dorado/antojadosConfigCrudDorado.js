import { getAntojadosPool, sqlType } from "../../db/sql.js";
import {
  INSTANCE_TYPE,
  SCOPE_TYPE,
  mapInstance,
  mapDimensionLocation,
  mapSubDimensionLocation,
  mapTemplateSummary,
  mapTemplateDimensionLocation,
  mapTemplateSubDimensionLocation,
  mapCheckedDimensionLocation,
  mapCheckedSubDimensionLocation,
  mapCheckedReplaceResult,
} from "../../domain/configuracion/antojadosInstanciasContracts.js";

const sql = sqlType();

function normalizeCode(value) {
  return String(value || "").trim();
}

function toBit(value) {
  if (value === undefined || value === null || value === "") return null;
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

function mapInstanceCascadeResponse(instance, dimensionLocations, subDimensionLocations) {
  return {
    instance,
    dimension_locations:     dimensionLocations,
    sub_dimension_locations: subDimensionLocations,
  };
}

function normalizeSignedContractItems(items = []) {
  return items
    .map((item) => {
      const requestedVisible = toBit(item?.requested_visible);
      const requestedEnabled = toBit(item?.requested_enabled);
      const checked = requestedEnabled === null
        ? (item?.active === false ? 0 : 1)
        : requestedEnabled;

      return {
        item_code: normalizeCode(item?.source_component_code || item?.item_code),
        location_id: normalizeCode(item?.location_id),
        sub_location_id: normalizeCode(item?.sub_location_id),
        requested_visible: requestedVisible,
        requested_enabled: requestedEnabled,
        checked,
        date_inicia: normalizeCode(item?.date_inicia),
        date_termina: normalizeCode(item?.date_termina),
        source_component_code: normalizeCode(item?.source_component_code || item?.item_code),
        source_sub_code: normalizeCode(item?.source_sub_code),
        plazo: normalizeCode(item?.plazo),
      };
    })
    .filter((item) => (item.location_id || item.sub_location_id) && item.plazo);
}

export async function listAntojadosInstancesCrud({ instanceType, tenantId, cuentaId, status } = {}) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceType", sql.NVarChar(20), instanceType ?? null)
    .input("tenantId",     sql.NVarChar(64), tenantId     ?? null)
    .input("cuentaId",     sql.NVarChar(64), cuentaId     ?? null)
    .input("status",       sql.NVarChar(30), status       ?? null)
    .query(`
      SELECT
        i.instance_id,
        i.cuenta_id,
        u.UserName      AS cuenta_user_name,
        u.Email         AS cuenta_email,
        u.DisplayName   AS cuenta_display_name,
        i.instance_type,
        i.tenant_id,
        i.root_location_id,
        i.status,
        i.snapshot_hash,
        i.cascade_synced_at,
        i.updated_at
      FROM antojados_core.sys_instancia i
      LEFT JOIN core_configuracion.sec_users u
        ON u.UserId = i.cuenta_id
      WHERE (@instanceType IS NULL OR i.instance_type = @instanceType)
        AND (@tenantId IS NULL OR i.tenant_id = @tenantId)
        AND (@cuentaId IS NULL OR i.cuenta_id = @cuentaId)
        AND (@status IS NULL OR i.status = @status)
      ORDER BY i.updated_at DESC, i.instance_id ASC;
    `);

  return result.recordset.map(mapInstance);
}

export async function getAntojadosInstanceCrud(instanceId) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), instanceId)
    .query(`
      SELECT
        i.instance_id,
        i.cuenta_id,
        u.UserName      AS cuenta_user_name,
        u.Email         AS cuenta_email,
        u.DisplayName   AS cuenta_display_name,
        i.instance_type,
        i.tenant_id,
        i.root_location_id,
        i.status,
        i.snapshot_hash,
        i.cascade_synced_at,
        i.created_at,
        i.updated_at
      FROM antojados_core.sys_instancia i
      LEFT JOIN core_configuracion.sec_users u
        ON u.UserId = i.cuenta_id
      WHERE i.instance_id = @instanceId;
    `);

  if (result.recordset.length === 0) return null;
  return mapInstance(result.recordset[0]);
}

export async function getAntojadosInstanceCascadeCrud(instanceId) {
  const pool = await getAntojadosPool();
  const instance = await getAntojadosInstanceCrud(instanceId);
  if (!instance) return null;

  const isUserInstance = String(instance.instance_type || "").trim() === INSTANCE_TYPE.USER;
  const resolvedTemplateCode = isUserInstance ? "DEFAULT_USER" : "DEFAULT_SPONSOR";
  const resolvedScopeType = isUserInstance ? SCOPE_TYPE.USER : SCOPE_TYPE.SPONSOR;

  const dimensionResult = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), instanceId)
    .input("templateCode", sql.NVarChar(100), resolvedTemplateCode)
    .input("scopeType", sql.NVarChar(20), resolvedScopeType)
    .input("isUserInstance", sql.Bit, isUserInstance ? 1 : 0)
    .query(`
      SELECT
        CASE WHEN @isUserInstance = 1 THEN t.template_location_id ELSE c.checked_location_id END AS location_id,
        @instanceId            AS instance_id,
        t.root_dimension_id    AS root_location_id,
        t.parent_dimension_id  AS parent_location_id,
        t.dimension_id,
        t.node_kind,
        t.node_level,
        t.code,
        t.label,
        t.module_code,
        t.area_code,
        t.component_code,
        CASE WHEN @isUserInstance = 1 THEN t.visible ELSE ISNULL(c.visible_override, t.visible) END AS visible,
        CASE WHEN @isUserInstance = 1 THEN t.enabled ELSE ISNULL(c.enabled_override, t.enabled) END AS enabled,
        t.meta_json,
        t.sort_order,
        t.is_leaf,
        CASE WHEN @isUserInstance = 1 THEN t.created_at ELSE c.created_at END AS materialized_at,
        CASE WHEN @isUserInstance = 1 THEN t.updated_at ELSE c.updated_at END AS updated_at
      FROM antojados_core.sys_dimension_location_template t
      LEFT JOIN antojados_core.sys_dimension_location_checked c
        ON c.template_location_id = t.template_location_id
       AND c.instance_id = @instanceId
      WHERE t.template_code = @templateCode
        AND t.scope_type IN ('all', @scopeType)
        AND t.is_active = 1
        AND (@isUserInstance = 1 OR c.checked_location_id IS NOT NULL)
      ORDER BY t.node_level ASC, t.sort_order ASC, t.code ASC;
    `);

  const subDimensionResult = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), instanceId)
    .input("templateCode", sql.NVarChar(100), resolvedTemplateCode)
    .input("scopeType", sql.NVarChar(20), resolvedScopeType)
    .input("isUserInstance", sql.Bit, isUserInstance ? 1 : 0)
    .query(`
      SELECT
        CASE WHEN @isUserInstance = 1 THEN t.template_sub_location_id ELSE c.checked_sub_location_id END AS id,
        @instanceId               AS instance_id,
        NULL                      AS root_location_id,
        t.sub_dimension_id,
        sd.sub_code,
        sd.sub_name,
        sd.sub_type,
        CASE WHEN @isUserInstance = 1 THEN t.visible ELSE ISNULL(c.visible_override, t.visible) END AS visible,
        CASE WHEN @isUserInstance = 1 THEN t.enabled ELSE ISNULL(c.enabled_override, t.enabled) END AS enabled,
        t.sort_order,
        CASE WHEN @isUserInstance = 1 THEN t.created_at ELSE c.created_at END AS materialized_at,
        CASE WHEN @isUserInstance = 1 THEN t.updated_at ELSE c.updated_at END AS updated_at
      FROM antojados_core.sys_sub_dimension_location_template t
      LEFT JOIN antojados_core.sys_sub_dimension_location_checked c
        ON c.template_sub_location_id = t.template_sub_location_id
       AND c.instance_id = @instanceId
      INNER JOIN antojados_core.sys_sub_dimension sd
        ON sd.sub_dimension_id = t.sub_dimension_id
      WHERE t.template_code = @templateCode
        AND t.scope_type IN ('all', @scopeType)
        AND t.is_active = 1
        AND (@isUserInstance = 1 OR c.checked_sub_location_id IS NOT NULL)
      ORDER BY t.sort_order ASC, sd.sub_code ASC;
    `);

  return mapInstanceCascadeResponse(
    instance,
    dimensionResult.recordset.map(mapDimensionLocation),
    subDimensionResult.recordset.map(mapSubDimensionLocation),
  );
}

export async function getAntojadosTenantCascadeCrud(tenantId) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("tenantId",     sql.NVarChar(64), tenantId)
    .input("instanceType", sql.NVarChar(20), INSTANCE_TYPE.SPONSOR)
    .query(`
      SELECT TOP (1) i.instance_id
      FROM antojados_core.sys_instancia i
      WHERE i.tenant_id     = @tenantId
        AND i.instance_type = @instanceType;
    `);

  if (result.recordset.length === 0) return null;
  return getAntojadosInstanceCascadeCrud(result.recordset[0].instance_id);
}

export async function getAntojadosUserCascadeCrud(userId) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("userId",       sql.NVarChar(64), userId)
    .input("instanceType", sql.NVarChar(20), INSTANCE_TYPE.USER)
    .query(`
      SELECT TOP (1) i.instance_id
      FROM antojados_core.sys_instancia i
      WHERE i.cuenta_id     = @userId
        AND i.instance_type = @instanceType;
    `);

  if (result.recordset.length === 0) return null;
  return getAntojadosInstanceCascadeCrud(result.recordset[0].instance_id);
}

async function resolveCheckedContextFromInstance(instanceId, { templateCode, scopeType } = {}) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), normalizeCode(instanceId))
    .query(`
      SELECT TOP (1) instance_type
      FROM antojados_core.sys_instancia
      WHERE instance_id = @instanceId;
    `);

  const instanceType = String(result.recordset?.[0]?.instance_type || "").trim();
  if (!instanceType) {
    throw new Error("resolveCheckedContextFromInstance: instancia no encontrada");
  }

  const isUserInstance = instanceType === INSTANCE_TYPE.USER;
  const defaultTemplateCode = isUserInstance ? "DEFAULT_USER" : "DEFAULT_SPONSOR";
  const defaultScopeType = isUserInstance ? SCOPE_TYPE.USER : SCOPE_TYPE.SPONSOR;

  return {
    resolvedTemplateCode: normalizeCode(templateCode || defaultTemplateCode),
    resolvedScopeType: scopeType || defaultScopeType,
  };
}

export async function listAntojadosDimensionsCrud({ reviewStatus, appliesTo, isActive } = {}) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("reviewStatus", sql.NVarChar(60), reviewStatus || null)
    .input("appliesTo", sql.NVarChar(40), appliesTo || null)
    .input("isActive", sql.Bit, toBit(isActive))
    .query(`
      SELECT
        dimension_id,
        dimension_code,
        parent_code,
        dimension_type,
        dimension_name,
        applies_to,
        visible_default,
        enabled_default,
        review_status,
        reviewed_by,
        reviewed_at,
        meta_json,
        is_active,
        created_at,
        updated_at
      FROM antojados_core.sys_dimension
      WHERE (@reviewStatus IS NULL OR review_status = @reviewStatus)
        AND (@appliesTo IS NULL OR applies_to IN ('all', @appliesTo))
        AND (@isActive IS NULL OR is_active = @isActive)
      ORDER BY dimension_type ASC, dimension_code ASC;
    `);

  return result.recordset;
}

export async function listAntojadosSubDimensionsCrud({
  parentDimensionId,
  parentCode,
  reviewStatus,
  appliesTo,
  isActive,
} = {}) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("parentDimensionId", sql.NVarChar(128), parentDimensionId || null)
    .input("parentCode", sql.NVarChar(400), parentCode || null)
    .input("reviewStatus", sql.NVarChar(60), reviewStatus || null)
    .input("appliesTo", sql.NVarChar(40), appliesTo || null)
    .input("isActive", sql.Bit, toBit(isActive))
    .query(`
      SELECT
        sd.sub_dimension_id,
        sd.parent_dimension_id,
        d.dimension_code AS parent_code,
        sd.sub_code,
        sd.sub_name,
        sd.sub_type,
        sd.applies_to,
        sd.enabled_default,
        sd.review_status,
        sd.reviewed_by,
        sd.reviewed_at,
        sd.meta_json,
        sd.is_active,
        sd.created_at,
        sd.updated_at
      FROM antojados_core.sys_sub_dimension sd
      INNER JOIN antojados_core.sys_dimension d ON d.dimension_id = sd.parent_dimension_id
      WHERE (@parentDimensionId IS NULL OR sd.parent_dimension_id = @parentDimensionId)
        AND (@parentCode IS NULL OR d.dimension_code = @parentCode)
        AND (@reviewStatus IS NULL OR sd.review_status = @reviewStatus)
        AND (@appliesTo IS NULL OR sd.applies_to IN ('all', @appliesTo))
        AND (@isActive IS NULL OR sd.is_active = @isActive)
      ORDER BY d.dimension_code ASC, sd.sub_code ASC;
    `);

  return result.recordset;
}

export async function approveAntojadosDimensionsCrud(codes = []) {
  if (!Array.isArray(codes) || codes.length === 0) return 0;
  const pool = await getAntojadosPool();
  let updated = 0;

  for (const rawCode of codes) {
    const code = normalizeCode(rawCode);
    if (!code) continue;
    const result = await pool
      .request()
      .input("code", sql.NVarChar(400), code)
      .query(`
        UPDATE antojados_core.sys_dimension
        SET review_status = 'APPROVED',
            reviewed_by = 'GT_API',
            reviewed_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE dimension_code = @code
          AND review_status = 'PENDING_REVIEW';
      `);
    updated += Number(result.rowsAffected[0] || 0);
  }

  return updated;
}

export async function approveAntojadosSubDimensionsCrud(codes = []) {
  if (!Array.isArray(codes) || codes.length === 0) return 0;
  const pool = await getAntojadosPool();
  let updated = 0;

  for (const rawCode of codes) {
    const code = normalizeCode(rawCode);
    if (!code) continue;
    const result = await pool
      .request()
      .input("code", sql.NVarChar(600), code)
      .query(`
        UPDATE antojados_core.sys_sub_dimension
        SET review_status = 'APPROVED',
            reviewed_by = 'GT_API',
            reviewed_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE sub_code = @code
          AND review_status = 'PENDING_REVIEW';
      `);
    updated += Number(result.rowsAffected[0] || 0);
  }

  return updated;
}

export async function updateAntojadosDimensionStatusCrud(code, status) {
  const normalized = status === "DEACTIVATED" ? "INACTIVE" : status;
  const reviewStatus = normalized === "ACTIVE" || normalized === "INACTIVE" ? null : normalized;
  const isActive = normalized === "ACTIVE" ? 1 : normalized === "INACTIVE" ? 0 : null;

  await (await getAntojadosPool())
    .request()
    .input("code", sql.NVarChar(400), normalizeCode(code))
    .input("reviewStatus", sql.NVarChar(60), reviewStatus)
    .input("isActive", sql.Bit, isActive)
    .query(`
      UPDATE antojados_core.sys_dimension
      SET
        review_status = COALESCE(@reviewStatus, review_status),
        is_active = COALESCE(@isActive, is_active),
        updated_at = SYSUTCDATETIME()
      WHERE dimension_code = @code;
    `);

  return normalized;
}

export async function updateAntojadosSubDimensionStatusCrud(code, status) {
  const normalized = status === "DEACTIVATED" ? "INACTIVE" : status;
  const reviewStatus = normalized === "ACTIVE" || normalized === "INACTIVE" ? null : normalized;
  const isActive = normalized === "ACTIVE" ? 1 : normalized === "INACTIVE" ? 0 : null;

  await (await getAntojadosPool())
    .request()
    .input("code", sql.NVarChar(600), normalizeCode(code))
    .input("reviewStatus", sql.NVarChar(60), reviewStatus)
    .input("isActive", sql.Bit, isActive)
    .query(`
      UPDATE antojados_core.sys_sub_dimension
      SET
        review_status = COALESCE(@reviewStatus, review_status),
        is_active = COALESCE(@isActive, is_active),
        updated_at = SYSUTCDATETIME()
      WHERE sub_code = @code;
    `);

  return normalized;
}

export async function updateAntojadosDimensionProfileCrud(code, payload = {}) {
  const normalizedCode = normalizeCode(code);
  const label = String(payload?.label || payload?.dimension_name || "").trim();
  if (!normalizedCode) {
    throw new Error("updateAntojadosDimensionProfileCrud: code requerido");
  }
  if (!label) {
    throw new Error("updateAntojadosDimensionProfileCrud: label requerido");
  }

  await (await getAntojadosPool())
    .request()
    .input("code", sql.NVarChar(400), normalizedCode)
    .input("label", sql.NVarChar(600), label)
    .query(`
      UPDATE antojados_core.sys_dimension
      SET
        dimension_name = @label,
        updated_at = SYSUTCDATETIME()
      WHERE dimension_code = @code;
    `);

  return { dimension_code: normalizedCode, label };
}

export async function updateAntojadosSubDimensionProfileCrud(code, payload = {}) {
  const normalizedCode = normalizeCode(code);
  const label = String(payload?.label || payload?.sub_name || "").trim();
  if (!normalizedCode) {
    throw new Error("updateAntojadosSubDimensionProfileCrud: code requerido");
  }
  if (!label) {
    throw new Error("updateAntojadosSubDimensionProfileCrud: label requerido");
  }

  await (await getAntojadosPool())
    .request()
    .input("code", sql.NVarChar(600), normalizedCode)
    .input("label", sql.NVarChar(600), label)
    .query(`
      UPDATE antojados_core.sys_sub_dimension
      SET
        sub_name = @label,
        updated_at = SYSUTCDATETIME()
      WHERE sub_code = @code;
    `);

  return { sub_code: normalizedCode, label };
}

export async function deleteAntojadosDimensionCrud(code) {
  const pool = await getAntojadosPool();
  const tx = pool.transaction();
  await tx.begin();
  try {
    const dim = await tx
      .request()
      .input("code", sql.NVarChar(400), normalizeCode(code))
      .query("SELECT dimension_id FROM antojados_core.sys_dimension WHERE dimension_code = @code;");

    const dimensionId = dim.recordset[0]?.dimension_id;
    if (dimensionId) {
      await tx
        .request()
        .input("dimensionId", sql.NVarChar(128), dimensionId)
        .query("DELETE FROM antojados_core.sys_sub_dimension WHERE parent_dimension_id = @dimensionId;");

      await tx
        .request()
        .input("code", sql.NVarChar(400), normalizeCode(code))
        .query("DELETE FROM antojados_core.sys_dimension WHERE dimension_code = @code;");
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function deleteAntojadosSubDimensionCrud(code) {
  await (await getAntojadosPool())
    .request()
    .input("code", sql.NVarChar(600), normalizeCode(code))
    .query("DELETE FROM antojados_core.sys_sub_dimension WHERE sub_code = @code;");
}

export async function listAntojadosTemplatesCrud({ scopeType } = {}) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("scopeType", sql.NVarChar(20), scopeType ?? null)
    .query(`
      SELECT
        t.template_code,
        t.scope_type,
        COUNT(*) AS dimension_node_count,
        SUM(CASE WHEN t.is_active = 1 THEN 1 ELSE 0 END) AS is_active_count,
        MAX(t.updated_at) AS updated_at,
        (
          SELECT COUNT(*)
          FROM antojados_core.sys_sub_dimension_location_template st
          WHERE st.template_code = t.template_code
            AND st.scope_type    = t.scope_type
        ) AS sub_dimension_count
      FROM antojados_core.sys_dimension_location_template t
      WHERE (@scopeType IS NULL OR t.scope_type = @scopeType)
      GROUP BY t.template_code, t.scope_type
      ORDER BY t.template_code ASC, t.scope_type ASC;
    `);

  return result.recordset.map(mapTemplateSummary);
}

export async function getAntojadosTemplateCrud(templateCode, { scopeType } = {}) {
  const pool = await getAntojadosPool();

  const summaryResult = await pool
    .request()
    .input("templateCode", sql.NVarChar(100), normalizeCode(templateCode))
    .input("scopeType",    sql.NVarChar(20),  scopeType ?? null)
    .query(`
      SELECT TOP (1)
        t.template_code,
        t.scope_type,
        COUNT(*) OVER (PARTITION BY t.template_code, t.scope_type) AS dimension_node_count,
        MAX(t.updated_at) OVER (PARTITION BY t.template_code, t.scope_type) AS updated_at
      FROM antojados_core.sys_dimension_location_template t
      WHERE t.template_code = @templateCode
        AND (@scopeType IS NULL OR t.scope_type = @scopeType);
    `);

  if (summaryResult.recordset.length === 0) return null;
  const { template_code, scope_type } = summaryResult.recordset[0];

  const dimensionResult = await pool
    .request()
    .input("templateCode", sql.NVarChar(100), template_code)
    .input("scopeType",    sql.NVarChar(20),  scope_type)
    .query(`
      SELECT
        t.template_location_id,
        t.template_code,
        t.scope_type,
        t.dimension_id,
        t.component_code,
        d.dimension_code,
        d.dimension_name,
        d.dimension_type,
        d.applies_to,
        t.visible,
        t.enabled,
        t.sort_order,
        t.meta_json,
        t.is_active,
        t.updated_at
      FROM antojados_core.sys_dimension_location_template t
      INNER JOIN antojados_core.sys_dimension d
        ON d.dimension_id = t.dimension_id
      WHERE t.template_code = @templateCode
        AND t.scope_type    = @scopeType
      ORDER BY t.sort_order ASC, d.dimension_code ASC;
    `);

  const subDimensionResult = await pool
    .request()
    .input("templateCode", sql.NVarChar(100), template_code)
    .input("scopeType",    sql.NVarChar(20),  scope_type)
    .query(`
      SELECT
        st.template_sub_location_id,
        st.template_code,
        st.scope_type,
        st.sub_dimension_id,
        sd.sub_code,
        sd.sub_name,
        sd.sub_type,
        sd.parent_dimension_id,
        st.enabled,
        st.sort_order,
        st.meta_json,
        st.is_active,
        st.updated_at
      FROM antojados_core.sys_sub_dimension_location_template st
      INNER JOIN antojados_core.sys_sub_dimension sd
        ON sd.sub_dimension_id = st.sub_dimension_id
      WHERE st.template_code = @templateCode
        AND st.scope_type    = @scopeType
      ORDER BY st.sort_order ASC, sd.sub_code ASC;
    `);

  return {
    template_code,
    scope_type,
    dimension_locations:     dimensionResult.recordset.map(mapTemplateDimensionLocation),
    sub_dimension_locations: subDimensionResult.recordset.map(mapTemplateSubDimensionLocation),
  };
}

export async function rebuildAntojadosTemplateCrud({ templateCode, scopeType }) {
  const pool = await getAntojadosPool();
  const normalizedTemplateCode = normalizeCode(templateCode);

  const dimResult = await pool
    .request()
    .input("template_code", sql.NVarChar(100), normalizedTemplateCode)
    .input("scope_type",    sql.NVarChar(20),  scopeType)
    .execute("antojados_core.sp_sys_dimension_location_template_rebuild");

  const subResult = await pool
    .request()
    .input("template_code", sql.NVarChar(100), normalizedTemplateCode)
    .input("scope_type",    sql.NVarChar(20),  scopeType)
    .execute("antojados_core.sp_sys_sub_dimension_location_template_rebuild");

  return {
    dimensions:     dimResult.recordset[0]    ?? null,
    sub_dimensions: subResult.recordset[0] ?? null,
  };
}

export async function materializeAntojadosSponsorCascadeCrud(instanceId) {
  const pool = await getAntojadosPool();
  const normalizedId = normalizeCode(instanceId);

  // Obtener template DEFAULT_SPONSOR completo (dim + sub)
  const dimTemplateResult = await pool.request().query(`
    SELECT template_location_id
    FROM antojados_core.sys_dimension_location_template
    WHERE template_code = 'DEFAULT_SPONSOR'
      AND scope_type IN ('all','sponsor')
      AND control_mode = 'OPERABLE'
      AND is_active = 1
  `);
  const subTemplateResult = await pool.request().query(`
    SELECT template_sub_location_id
    FROM antojados_core.sys_sub_dimension_location_template
    WHERE template_code = 'DEFAULT_SPONSOR'
      AND scope_type IN ('all','sponsor')
      AND control_mode = 'OPERABLE'
      AND is_active = 1
  `);

  const dimPayload = dimTemplateResult.recordset.map(r => ({
    template_location_id: r.template_location_id,
    visible: true, enabled: true, checked: true,
  }));
  const subPayload = subTemplateResult.recordset.map(r => ({
    template_sub_location_id: r.template_sub_location_id,
    visible: true, enabled: true, checked: true,
  }));

  if (dimPayload.length === 0) throw new Error("materializeAntojadosSponsorCascade: template DEFAULT_SPONSOR vacío");

  // Reset + reseed checked desde template (UPSERT a defaults)
  const dimResult = await pool
    .request()
    .input("instance_id",   sql.NVarChar(64),       normalizedId)
    .input("template_code", sql.NVarChar(100),       "DEFAULT_SPONSOR")
    .input("scope_type",    sql.NVarChar(20),        "sponsor")
    .input("details",       sql.NVarChar(sql.MAX),   JSON.stringify(dimPayload))
    .execute("antojados_core.sp_sys_dimension_location_checked_replace");

  const subResult = await pool
    .request()
    .input("instance_id",   sql.NVarChar(64),       normalizedId)
    .input("template_code", sql.NVarChar(100),       "DEFAULT_SPONSOR")
    .input("scope_type",    sql.NVarChar(20),        "sponsor")
    .input("details",       sql.NVarChar(sql.MAX),   JSON.stringify(subPayload))
    .execute("antojados_core.sp_sys_sub_dimension_location_checked_replace");

  return {
    ok: true,
    instance_id:  normalizedId,
    dim_count:    dimPayload.length,
    sub_count:    subPayload.length,
    dim_result:   dimResult.recordset?.[0]  ?? null,
    sub_result:   subResult.recordset?.[0]  ?? null,
  };
}

export async function getAntojadosCheckedDimensionsGridCrud({ instanceId, templateCode, scopeType } = {}) {
  const { resolvedTemplateCode, resolvedScopeType } = await resolveCheckedContextFromInstance(instanceId, {
    templateCode,
    scopeType,
  });
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizeCode(instanceId))
    .input("template_code", sql.NVarChar(100), resolvedTemplateCode)
    .input("scope_type", sql.NVarChar(20), resolvedScopeType)
    .execute("antojados_core.sp_sys_dimension_location_checked_get_grid");

  return result.recordset
    .map((row) => mapCheckedDimensionLocation({
      ...row,
      scope_type: row?.scope_type ?? resolvedScopeType,
    }))
    .filter((row) => {
      const scope = String(row?.scope_type || "").trim().toLowerCase();
      if (scope !== "sponsor") return true;
      const mode = String(row?.control_mode || "").trim().toUpperCase();
      // En sponsor, checked puede venir en DEFAULT (sin override manual) u OPERABLE.
      return mode === "OPERABLE" || mode === "DEFAULT" || mode === "";
    });
}

export async function replaceAntojadosCheckedDimensionsCrud({ instanceId, templateCode, scopeType, details } = {}) {
  if (!Array.isArray(details)) throw new Error("replaceAntojadosCheckedDimensionsCrud: details debe ser array");

  const { resolvedTemplateCode, resolvedScopeType } = await resolveCheckedContextFromInstance(instanceId, {
    templateCode,
    scopeType,
  });

  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizeCode(instanceId))
    .input("template_code", sql.NVarChar(100), resolvedTemplateCode)
    .input("scope_type", sql.NVarChar(20), resolvedScopeType)
    .input("details", sql.NVarChar(sql.MAX), JSON.stringify(details))
    .execute("antojados_core.sp_sys_dimension_location_checked_replace");

  if (!result.recordset?.[0]) {
    throw new Error("sp_sys_dimension_location_checked_replace: sin respuesta");
  }
  return mapCheckedReplaceResult(result.recordset[0]);
}

export async function getAntojadosCheckedSubDimensionsGridCrud({ instanceId, templateCode, scopeType } = {}) {
  const { resolvedTemplateCode, resolvedScopeType } = await resolveCheckedContextFromInstance(instanceId, {
    templateCode,
    scopeType,
  });
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizeCode(instanceId))
    .input("template_code", sql.NVarChar(100), resolvedTemplateCode)
    .input("scope_type", sql.NVarChar(20), resolvedScopeType)
    .execute("antojados_core.sp_sys_sub_dimension_location_checked_get_grid");

  return result.recordset
    .map((row) => mapCheckedSubDimensionLocation({
      ...row,
      scope_type: row?.scope_type ?? resolvedScopeType,
    }))
    .filter((row) => {
      const scope = String(row?.scope_type || "").trim().toLowerCase();
      if (scope !== "sponsor") return true;
      const mode = String(row?.control_mode || "").trim().toUpperCase();
      // En sponsor, checked puede venir en DEFAULT (sin override manual) u OPERABLE.
      return mode === "OPERABLE" || mode === "DEFAULT" || mode === "";
    });
}

export async function replaceAntojadosCheckedSubDimensionsCrud({ instanceId, templateCode, scopeType, details } = {}) {
  if (!Array.isArray(details)) throw new Error("replaceAntojadosCheckedSubDimensionsCrud: details debe ser array");

  const { resolvedTemplateCode, resolvedScopeType } = await resolveCheckedContextFromInstance(instanceId, {
    templateCode,
    scopeType,
  });

  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizeCode(instanceId))
    .input("template_code", sql.NVarChar(100), resolvedTemplateCode)
    .input("scope_type", sql.NVarChar(20), resolvedScopeType)
    .input("details", sql.NVarChar(sql.MAX), JSON.stringify(details))
    .execute("antojados_core.sp_sys_sub_dimension_location_checked_replace");

  if (!result.recordset?.[0]) {
    throw new Error("sp_sys_sub_dimension_location_checked_replace: sin respuesta");
  }
  return mapCheckedReplaceResult(result.recordset[0]);
}

export async function updateAntojadosTemplateLocationCrud(templateCode, templateLocationId, { visible, enabled, sortOrder }) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("templateCode", sql.NVarChar(100), normalizeCode(templateCode))
    .input("templateLocationId", sql.NVarChar(64), normalizeCode(templateLocationId))
    .input("visible", sql.Bit, toBit(visible))
    .input("enabled", sql.Bit, toBit(enabled))
    .input("sortOrder", sql.Int, sortOrder ?? null)
    .query(`
      UPDATE antojados_core.sys_dimension_location_template
      SET
        visible = ISNULL(@visible, visible),
        enabled = ISNULL(@enabled, enabled),
        sort_order = ISNULL(@sortOrder, sort_order),
        updated_at = SYSUTCDATETIME()
      WHERE template_location_id = @templateLocationId
        AND template_code = @templateCode;
      SELECT @@ROWCOUNT AS affected;
    `);

  return { affected: result.recordset[0]?.affected ?? 0 };
}

export async function updateAntojadosTemplateSubLocationCrud(templateCode, templateSubLocationId, { enabled, sortOrder }) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("templateCode", sql.NVarChar(100), normalizeCode(templateCode))
    .input("templateSubLocationId", sql.NVarChar(64), normalizeCode(templateSubLocationId))
    .input("enabled", sql.Bit, toBit(enabled))
    .input("sortOrder", sql.Int, sortOrder ?? null)
    .query(`
      UPDATE antojados_core.sys_sub_dimension_location_template
      SET
        enabled = ISNULL(@enabled, enabled),
        sort_order = ISNULL(@sortOrder, sort_order),
        updated_at = SYSUTCDATETIME()
      WHERE template_sub_location_id = @templateSubLocationId
        AND template_code = @templateCode;
      SELECT @@ROWCOUNT AS affected;
    `);

  return { affected: result.recordset[0]?.affected ?? 0 };
}

export async function propagateAntojadosTemplateToUserInstancesCrud({ templateCode, scopeType, instanceType } = {}) {
  const template_code = normalizeCode(templateCode || "DEFAULT_USER");
  const scope_type = scopeType || SCOPE_TYPE.USER;
  const instance_type = instanceType || INSTANCE_TYPE.USER;

  if (scope_type !== SCOPE_TYPE.USER || instance_type !== INSTANCE_TYPE.USER) {
    throw new Error("propagateAntojadosTemplateToUserInstancesCrud: checked overlay solo aplica para scope/instance user");
  }

  const pool = await getAntojadosPool();
  const instancesResult = await pool
    .request()
    .input("instanceType", sql.NVarChar(20), instance_type)
    .query(`
      SELECT instance_id
      FROM antojados_core.sys_instancia
      WHERE instance_type = @instanceType
        AND status NOT IN ('deleted', 'DEACTIVATED');
    `);

  const instances = instancesResult.recordset;
  const instanceIds = instances.map((row) => normalizeCode(row?.instance_id)).filter(Boolean);

  let dimension_deleted = 0;
  let sub_dimension_deleted = 0;

  if (instanceIds.length > 0) {
    const inClause = instanceIds.map((_, idx) => `@instanceId${idx}`).join(",");
    const cleanupRequest = pool.request();
    instanceIds.forEach((id, idx) => cleanupRequest.input(`instanceId${idx}`, sql.NVarChar(64), id));

    const cleanupResult = await cleanupRequest.query(`
      DELETE FROM antojados_core.sys_dimension_location_checked
      WHERE instance_id IN (${inClause});
      DECLARE @dimDeleted INT = @@ROWCOUNT;

      DELETE FROM antojados_core.sys_sub_dimension_location_checked
      WHERE instance_id IN (${inClause});
      DECLARE @subDeleted INT = @@ROWCOUNT;

      SELECT @dimDeleted AS dimension_deleted, @subDeleted AS sub_dimension_deleted;
    `);

    dimension_deleted = Number(cleanupResult.recordset?.[0]?.dimension_deleted || 0);
    sub_dimension_deleted = Number(cleanupResult.recordset?.[0]?.sub_dimension_deleted || 0);
  }

  return {
    template_code,
    scope_type,
    instance_type,
    propagated: instances.length,
    governance_mode: "template_only_user",
    dimension_deleted,
    sub_dimension_deleted,
  };
}

export async function listAntojadosSponsorsCrud({ search, status, cityCode, businessName, instanceId } = {}) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceType", sql.NVarChar(20), INSTANCE_TYPE.SPONSOR)
    .input("status",       sql.NVarChar(30), status ?? null)
    .input("search",       sql.NVarChar(64), search ?? null)
    .input("cityCode",     sql.NVarChar(60), cityCode ?? null)
    .input("businessName", sql.NVarChar(200), businessName ?? null)
    .input("instanceId",   sql.NVarChar(64), instanceId ?? null)
    .query(`
      SELECT
        i.instance_id,
        i.status,
        t.business_name,
        t.city_code,
        t.biz_type
      FROM antojados_core.sys_instancia i
      LEFT JOIN antojados_core.biz_tenants t ON t.id = i.tenant_id
      WHERE i.instance_type = @instanceType
        AND (@status IS NULL OR i.status = @status)
        AND (@cityCode IS NULL OR t.city_code = @cityCode)
        AND (@businessName IS NULL OR t.business_name = @businessName)
        AND (@instanceId IS NULL OR i.instance_id = @instanceId)
        AND (@search IS NULL
             OR i.tenant_id LIKE '%' + @search + '%'
             OR t.business_name LIKE '%' + @search + '%')
        AND t.id IS NOT NULL
      ORDER BY t.business_name ASC, i.tenant_id ASC;
    `);
  return result.recordset;
}

export async function suspendAntojadosSponsorInstanceCrud(instanceId) {
  const normalizedInstanceId = normalizeCode(instanceId);
  if (!normalizedInstanceId) {
    throw new Error("suspendAntojadosSponsorInstanceCrud: instanceId requerido");
  }

  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
    .input("sponsorType", sql.NVarChar(20), INSTANCE_TYPE.SPONSOR)
    .query(`
      BEGIN TRY
        BEGIN TRAN;

        UPDATE antojados_core.sys_instancia
        SET status = N'suspended',
            updated_at = SYSUTCDATETIME()
        WHERE instance_id = @instanceId
          AND instance_type = @sponsorType;

        DECLARE @instAffected INT = @@ROWCOUNT;

        UPDATE antojados_core.sys_dimension_location_checked
        SET enabled_override = 0,
            updated_at = SYSUTCDATETIME()
        WHERE instance_id = @instanceId;

        DECLARE @dimAffected INT = @@ROWCOUNT;

        UPDATE antojados_core.sys_sub_dimension_location_checked
        SET enabled_override = 0,
            updated_at = SYSUTCDATETIME()
        WHERE instance_id = @instanceId;

        DECLARE @subAffected INT = @@ROWCOUNT;

        COMMIT TRAN;

        SELECT @instAffected AS instance_affected,
               @dimAffected AS dimension_affected,
               @subAffected AS sub_dimension_affected;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRAN;
        THROW;
      END CATCH
    `);

  const row = result.recordset?.[0] || {};
  return {
    instance_id: normalizedInstanceId,
    instance_affected: row.instance_affected ?? 0,
    dimension_affected: row.dimension_affected ?? 0,
    sub_dimension_affected: row.sub_dimension_affected ?? 0,
  };
}

// ─── Patch instance dimension location (sponsor cascade) ─────────────────────

export async function patchAntojadosInstanceLocationEnabledCrud(instanceId, locationId, { visible, enabled }) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceId",  sql.NVarChar(64), instanceId)
    .input("locationId",  sql.NVarChar(64), locationId)
    .input("visible",     sql.Bit,          toBit(visible))
    .input("enabled",     sql.Bit,          toBit(enabled))
    .query(`
      UPDATE antojados_core.sys_dimension_location_checked
      SET visible_override = ISNULL(@visible, visible_override),
          enabled_override = ISNULL(@enabled, enabled_override),
          updated_at       = SYSUTCDATETIME()
      WHERE checked_location_id = @locationId
        AND instance_id = @instanceId;
      SELECT @@ROWCOUNT AS affected;
    `);
  return { affected: result.recordset[0]?.affected ?? 0 };
}

// ─── Patch instance sub-dimension location (sponsor cascade) ─────────────────

export async function patchAntojadosInstanceSubLocationEnabledCrud(instanceId, subId, enabled) {
  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), instanceId)
    .input("subId",      sql.NVarChar(64), subId)
    .input("enabled",    sql.Bit,          toBit(enabled))
    .query(`
      UPDATE antojados_core.sys_sub_dimension_location_checked
      SET enabled_override = @enabled,
          updated_at       = SYSUTCDATETIME()
      WHERE checked_sub_location_id = @subId
        AND instance_id  = @instanceId;
      SELECT @@ROWCOUNT AS affected;
    `);
  return { affected: result.recordset[0]?.affected ?? 0 };
}

export async function registerAntojadosSignedContractCrud({
  instanceId,
  requestId,
  signedBy,
  signedAt,
  contract,
  signature,
  contractHash,
}) {
  const normalizedInstanceId = normalizeCode(instanceId);
  const normalizedRequestId = normalizeCode(requestId);
  const normalizedSignedBy = normalizeCode(signedBy);
  const normalizedSignedAt = normalizeCode(signedAt) || new Date().toISOString();
  const normalizedItems = normalizeSignedContractItems(contract?.items || []);

  if (!normalizedInstanceId) {
    throw new Error("registerAntojadosSignedContractCrud: instanceId requerido");
  }
  if (!normalizedRequestId) {
    throw new Error("registerAntojadosSignedContractCrud: requestId requerido");
  }
  if (!normalizedSignedBy) {
    throw new Error("registerAntojadosSignedContractCrud: signedBy requerido");
  }
  if (normalizedItems.length === 0) {
    throw new Error("registerAntojadosSignedContractCrud: contract.items inválido");
  }

  const signedAtDate = new Date(normalizedSignedAt);
  const validUntilCandidates = normalizedItems
    .filter((item) => item.checked === 1)
    .map((item) => addMonthsUtc(signedAtDate, plazoMonths(item.plazo)));
  const validUntil = validUntilCandidates.length > 0
    ? new Date(Math.min(...validUntilCandidates.map((date) => date.getTime())))
    : null;

  const pool = await getAntojadosPool();
  const tx = pool.transaction();
  await tx.begin();

  try {
    const instanceResult = await tx
      .request()
      .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
      .input("instanceType", sql.NVarChar(20), INSTANCE_TYPE.SPONSOR)
      .query(`
        SELECT TOP (1) i.instance_id
        FROM antojados_core.sys_instancia i
        WHERE i.instance_id = @instanceId
          AND i.instance_type = @instanceType;
      `);

    if (instanceResult.recordset.length === 0) {
      throw new Error("registerAntojadosSignedContractCrud: instancia sponsor no encontrada");
    }

    const existingResult = await tx
      .request()
      .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
      .input("requestId", sql.NVarChar(120), normalizedRequestId)
      .query(`
        SELECT TOP (1)
          r.instance_id,
          r.operation_id,
          r.operation_by,
          r.operation_at,
          r.operation_hash,
          r.operation_state,
          r.activation_state,
          r.notification_target,
          r.notification_state,
          r.created_at
        FROM antojados_core.sys_sponsor_module_operation_request r
        WHERE r.instance_id = @instanceId
          AND r.operation_id = @requestId;
      `);

    if (existingResult.recordset.length > 0) {
      const row = existingResult.recordset[0];
      const itemsResult = await tx
        .request()
        .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
        .input("requestId", sql.NVarChar(120), normalizedRequestId)
        .query(`
          SELECT
            module_code,
            location_id,
            sub_location_id,
            requested_visible,
            requested_enabled,
            date_inicia,
            date_termina,
            checked,
            plazo,
            target_visible,
            target_enabled,
            source_component_code,
            source_sub_code,
            apply_state,
            apply_message,
            applied_at
          FROM antojados_core.sys_sponsor_module_operation_item
          WHERE instance_id = @instanceId
            AND operation_id = @requestId
          ORDER BY COALESCE(location_id, sub_location_id, module_code) ASC;
        `);

      await tx.commit();

      return {
        replayed: true,
        row: {
          instance_id: row.instance_id,
          request_id: row.operation_id,
          signed_by: row.operation_by,
          signed_at: row.operation_at,
          contract_hash: row.operation_hash,
          lifecycle_state: row.operation_state,
          activation_state: row.activation_state,
          notification_target: row.notification_target,
          notification_state: row.notification_state,
          created_at: row.created_at,
          items: itemsResult.recordset.map((item) => ({
            item_code: item.module_code,
            location_id: item.location_id,
            sub_location_id: item.sub_location_id,
            requested_visible: item.requested_visible === null ? null : Boolean(item.requested_visible),
            requested_enabled: item.requested_enabled === null ? null : Boolean(item.requested_enabled),
            date_inicia: item.date_inicia,
            date_termina: item.date_termina,
            checked: Boolean(item.checked),
            plazo: item.plazo,
            target_visible: item.target_visible === null ? null : Boolean(item.target_visible),
            target_enabled: item.target_enabled === null ? null : Boolean(item.target_enabled),
            source_component_code: item.source_component_code,
            source_sub_code: item.source_sub_code,
            apply_state: item.apply_state,
            apply_message: item.apply_message,
            applied_at: item.applied_at,
          })),
        },
      };
    }

    await tx
      .request()
      .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
      .input("requestId", sql.NVarChar(120), normalizedRequestId)
      .input("signedBy", sql.NVarChar(150), normalizedSignedBy)
      .input("signedAt", sql.DateTime2(7), normalizedSignedAt)
      .input("contractHash", sql.NVarChar(64), normalizeCode(contractHash))
      .input("contractJson", sql.NVarChar(sql.MAX), JSON.stringify(contract || {}))
      .input("signatureJson", sql.NVarChar(sql.MAX), signature ? JSON.stringify(signature) : null)
      .query(`
        INSERT INTO antojados_core.sys_sponsor_module_operation_request (
          instance_id,
          operation_id,
          operation_by,
          operation_at,
          operation_hash,
          operation_state,
          activation_state,
          notification_target,
          notification_state,
          operation_json,
          created_at,
          updated_at
        )
        VALUES (
          @instanceId,
          @requestId,
          @signedBy,
          @signedAt,
          @contractHash,
          N'registered',
          N'pending_activation',
          N'ATENCION',
          N'queued',
          @contractJson,
          SYSUTCDATETIME(),
          SYSUTCDATETIME()
        );
      `);

    for (const item of normalizedItems) {
      await tx
        .request()
        .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
        .input("requestId", sql.NVarChar(120), normalizedRequestId)
        .input("itemCode", sql.NVarChar(150), item.item_code)
        .input("locationId", sql.NVarChar(64), item.location_id || null)
        .input("subLocationId", sql.NVarChar(64), item.sub_location_id || null)
        .input("requestedVisible", sql.Bit, item.requested_visible)
        .input("requestedEnabled", sql.Bit, item.requested_enabled)
        .input("sourceComponentCode", sql.NVarChar(200), item.source_component_code || null)
        .input("sourceSubCode", sql.NVarChar(300), item.source_sub_code || null)
        .input("checked", sql.Bit, item.checked)
        .input("plazo", sql.NVarChar(20), item.plazo)
        .input("dateInicia", sql.DateTime2(7), signedAtDate)
        .input("dateTerminaComputed", sql.DateTime2(7), item.checked === 1 ? addMonthsUtc(signedAtDate, plazoMonths(item.plazo)) : null)
        .query(`
          INSERT INTO antojados_core.sys_sponsor_module_operation_item (
            instance_id,
            operation_id,
            module_code,
            location_id,
            sub_location_id,
            requested_visible,
            requested_enabled,
            date_inicia,
            date_termina,
            source_component_code,
            source_sub_code,
            checked,
            plazo,
            target_visible,
            target_enabled,
            apply_state,
            apply_message,
            created_at,
            updated_at
          )
          VALUES (
            @instanceId,
            @requestId,
            @itemCode,
            @locationId,
            @subLocationId,
            @requestedVisible,
            @requestedEnabled,
            @dateInicia,
            @dateTerminaComputed,
            @sourceComponentCode,
            @sourceSubCode,
            @checked,
            @plazo,
            NULL,
            NULL,
            N'pending_activation',
            NULL,
            SYSUTCDATETIME(),
            SYSUTCDATETIME()
          );
        `);
    }

    await tx
      .request()
      .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
      .input("requestId", sql.NVarChar(120), normalizedRequestId)
      .input("validUntil", sql.DateTime2(7), validUntil)
      .query(`
        UPDATE antojados_core.sys_sponsor_module_operation_request
        SET valid_until = @validUntil,
            updated_at  = SYSUTCDATETIME()
        WHERE instance_id = @instanceId
          AND operation_id = @requestId;
      `);

    await tx.commit();

    return {
      replayed: false,
      row: {
        instance_id: normalizedInstanceId,
        request_id: normalizedRequestId,
        signed_by: normalizedSignedBy,
        signed_at: normalizedSignedAt,
        contract_hash: normalizeCode(contractHash),
        lifecycle_state: "registered",
        activation_state: "pending_activation",
        notification_target: "ATENCION",
        notification_state: "queued",
        valid_until: validUntil,
        items: normalizedItems.map((item) => ({
          item_code: item.item_code,
          location_id: item.location_id,
          sub_location_id: item.sub_location_id,
          requested_visible: item.requested_visible === null ? null : Boolean(item.requested_visible),
          requested_enabled: item.requested_enabled === null ? null : Boolean(item.requested_enabled),
          date_inicia: signedAtDate.toISOString(),
          date_termina: item.checked === 1 ? addMonthsUtc(signedAtDate, plazoMonths(item.plazo)).toISOString() : null,
          checked: Boolean(item.checked),
          plazo: item.plazo,
          target_visible: null,
          target_enabled: null,
          source_component_code: item.source_component_code,
          source_sub_code: item.source_sub_code,
          apply_state: "pending_activation",
          apply_message: null,
          applied_at: null,
        })),
      },
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function listAntojadosSignedContractsCrud(instanceId) {
  const normalizedInstanceId = normalizeCode(instanceId);
  if (!normalizedInstanceId) {
    throw new Error("listAntojadosSignedContractsCrud: instanceId requerido");
  }

  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
    .query(`
      SELECT
        r.instance_id,
        r.operation_id,
        r.operation_by,
        r.operation_at,
        r.valid_until,
        r.operation_hash,
        r.operation_state,
        r.activation_state,
        r.notification_target,
        r.notification_state,
        r.created_at,
        (
          SELECT COUNT(*)
          FROM antojados_core.sys_sponsor_module_operation_item i
          WHERE i.instance_id = r.instance_id
            AND i.operation_id = r.operation_id
        ) AS item_count,
        (
          SELECT COUNT(*)
          FROM antojados_core.sys_sponsor_module_operation_item i
          WHERE i.instance_id = r.instance_id
            AND i.operation_id = r.operation_id
            AND i.apply_state = N'pending_activation'
        ) AS pending_item_count,
        (
          SELECT COUNT(*)
          FROM antojados_core.sys_sponsor_module_operation_item i
          WHERE i.instance_id = r.instance_id
            AND i.operation_id = r.operation_id
            AND i.apply_state = N'applied'
        ) AS applied_item_count,
        (
          SELECT COUNT(*)
          FROM antojados_core.sys_sponsor_module_operation_item i
          WHERE i.instance_id = r.instance_id
            AND i.operation_id = r.operation_id
            AND i.apply_state = N'failed'
        ) AS failed_item_count,
        (
          SELECT COUNT(*)
          FROM antojados_core.sys_sponsor_module_operation_item i
          WHERE i.instance_id = r.instance_id
            AND i.operation_id = r.operation_id
            AND i.apply_state = N'pending_mapping'
        ) AS pending_mapping_item_count
      FROM antojados_core.sys_sponsor_module_operation_request r
      WHERE r.instance_id = @instanceId
      ORDER BY r.created_at DESC, r.operation_id DESC;
    `);

  return result.recordset.map((row) => ({
    instance_id: row.instance_id,
    request_id: row.operation_id,
    signed_by: row.operation_by,
    signed_at: row.operation_at,
    valid_until: row.valid_until,
    contract_hash: row.operation_hash,
    lifecycle_state: row.operation_state,
    activation_state: row.activation_state,
    notification_target: row.notification_target,
    notification_state: row.notification_state,
    created_at: row.created_at,
    item_count: row.item_count ?? 0,
    pending_item_count: row.pending_item_count ?? 0,
    applied_item_count: row.applied_item_count ?? 0,
    failed_item_count: row.failed_item_count ?? 0,
    pending_mapping_item_count: row.pending_mapping_item_count ?? 0,
  }));
}

/**
 * Aplica el diff de un contrato firmado sobre la cascada vigente de la instancia.
 * Regla: checked=true + cascade disabled → habilitar (eso es la automatización).
 *        checked=true + cascade ya enabled → no-op (marcar applied sin cambio).
 *        checked=false → acción explícita de deshabilitar (siempre ejecuta).
 * Computa valid_until desde el plazo mínimo entre los items y lo persiste en el request.
 */

function plazoMonths(plazo) {
  const normalized = String(plazo || "").trim();
  if (["1", "3", "6", "12"].includes(normalized)) {
    return Number(normalized);
  }
  return 1;
}

function addMonthsUtc(baseDate, months) {
  const date = new Date(baseDate);
  const targetDay = date.getUTCDate();
  const result = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    1,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
  const lastDayOfTargetMonth = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(targetDay, lastDayOfTargetMonth));
  return result;
}

export async function applyAntojadosSponsorContractDiffCrud(instanceId, requestId) {
  const normalizedInstanceId = normalizeCode(instanceId);
  const normalizedRequestId = normalizeCode(requestId);

  if (!normalizedInstanceId || !normalizedRequestId) {
    throw new Error("applyAntojadosSponsorContractDiffCrud: instanceId y requestId requeridos");
  }

  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
    .input("requestId", sql.NVarChar(120), normalizedRequestId)
    .query(`
      EXEC antojados_core.sp_sys_sponsor_module_operation_apply_by_id
        @instance_id = @instanceId,
        @operation_id = @requestId;
    `);

  const headerResult = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
    .input("requestId", sql.NVarChar(120), normalizedRequestId)
    .query(`
      SELECT activation_state, valid_until
      FROM antojados_core.sys_sponsor_module_operation_request
      WHERE instance_id = @instanceId
        AND operation_id = @requestId;
    `);

  return {
    applied: Number(result.recordset[0]?.affected || 0),
    skipped_already_active: 0,
    pending_mapping: 0,
    failed: 0,
    activation_state: headerResult.recordset[0]?.activation_state || null,
    valid_until: headerResult.recordset[0]?.valid_until ? new Date(headerResult.recordset[0].valid_until).toISOString() : null,
  };
}

/**
 * Revierte la cascada de una instancia cuando su contrato vence sin renovación.
 * Deshabilita en sys_dimension_location_checked todos los nodos que el contrato activó
 * (apply_state = 'applied' AND checked = 1).
 * Marca activation_state = 'expired' en el request.
 */
export async function revertAntojadosSponsorContractCrud(instanceId, requestId) {
  const normalizedInstanceId = normalizeCode(instanceId);
  const normalizedRequestId = normalizeCode(requestId);
  if (!normalizedInstanceId || !normalizedRequestId) {
    throw new Error("revertAntojadosSponsorContractCrud: instanceId y requestId requeridos");
  }

  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
    .input("requestId", sql.NVarChar(120), normalizedRequestId)
    .query(`
      EXEC antojados_core.sp_sys_sponsor_module_operation_revert_by_id
        @instance_id = @instanceId,
        @operation_id = @requestId;
    `);

  const headerResult = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
    .input("requestId", sql.NVarChar(120), normalizedRequestId)
    .query(`
      SELECT activation_state
      FROM antojados_core.sys_sponsor_module_operation_request
      WHERE instance_id = @instanceId
        AND operation_id = @requestId;
    `);

  return {
    reverted: Number(result.recordset[0]?.reverted || 0),
    activation_state: headerResult.recordset[0]?.activation_state || null,
  };
}

/**
 * Monitorea el plazo de contratos activos:
 * - contracts_expiring: vencen en los próximos @warningDays días (notificar)
 * - contracts_expired: valid_until ya pasó y aún están en estado active/partially_active (revertir)
 */
export async function getAntojadosExpiringContractsCrud({ warningDays = 7 } = {}) {
  const pool = await getAntojadosPool();

  const result = await pool.request()
    .input("warningDays", sql.Int, warningDays)
    .query(`
      SELECT
        req.instance_id,
        req.operation_id AS request_id,
        req.operation_by AS signed_by,
        req.operation_at AS signed_at,
        req.valid_until,
        req.activation_state,
        req.notification_target,
        req.notification_state,
        CASE
          WHEN req.valid_until < SYSUTCDATETIME()
          THEN N'expired'
          WHEN req.valid_until <= DATEADD(DAY, @warningDays, SYSUTCDATETIME())
          THEN N'expiring_soon'
          ELSE N'active'
        END AS expiry_status
      FROM antojados_core.sys_sponsor_module_operation_request req
      WHERE req.valid_until IS NOT NULL
        AND req.activation_state IN (N'active', N'partially_active')
        AND req.valid_until <= DATEADD(DAY, @warningDays, SYSUTCDATETIME())
      ORDER BY req.valid_until ASC;
    `);

  const expired  = result.recordset.filter(r => r.expiry_status === "expired");
  const expiring = result.recordset.filter(r => r.expiry_status === "expiring_soon");

  return { contracts_expired: expired, contracts_expiring: expiring };
}

/**
 * Marca que se envió notificación de expiración para un contrato.
 */
export async function markAntojadosContractNotifiedCrud(instanceId, requestId, notificationState) {
  const pool = await getAntojadosPool();
  await pool.request()
    .input("instanceId",         sql.NVarChar(64),  normalizeCode(instanceId))
    .input("requestId",          sql.NVarChar(120), normalizeCode(requestId))
    .input("notificationState",  sql.NVarChar(40),  notificationState)
    .query(`
        UPDATE antojados_core.sys_sponsor_module_operation_request
      SET notification_state = @notificationState,
          updated_at         = SYSUTCDATETIME()
        WHERE instance_id = @instanceId AND operation_id = @requestId;
    `);
}

/**
 * Lee el último request de la instancia + sus checked items.
 * No hace JOIN contra la cascada (eso lo hace el servicio con getAntojadosInstanceCascadeCrud).
 */
export async function getAntojadosSponsorContractLatestItemsCrud(instanceId) {
  const normalizedId = normalizeCode(instanceId);
  if (!normalizedId) throw new Error("getAntojadosSponsorContractLatestItemsCrud: instanceId requerido");

  const pool = await getAntojadosPool();

  const reqResult = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), normalizedId)
    .query(`
      SELECT TOP 1 operation_id
      FROM antojados_core.sys_sponsor_module_operation_request
      WHERE instance_id = @instanceId
      ORDER BY created_at DESC;
    `);

  if (reqResult.recordset.length === 0) {
    return { request_id: null, items: [] };
  }

  const requestId = reqResult.recordset[0].operation_id;

  const itemsResult = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), normalizedId)
    .input("requestId",  sql.NVarChar(120), requestId)
    .query(`
      SELECT
        module_code,
        checked_location_id,
        checked_sub_location_id,
        requested_visible,
        requested_enabled,
        date_inicia,
        date_termina,
        checked,
        apply_state,
        target_enabled,
        target_visible,
        source_component_code,
        source_sub_code,
        applied_at
      FROM antojados_core.sys_sponsor_module_operation_item
      WHERE instance_id = @instanceId
        AND operation_id = @requestId;
    `);

  return {
    request_id: requestId,
    items: itemsResult.recordset.map((row) => ({
      ...row,
      item_code: row.module_code,
      location_id: row.checked_location_id ?? null,
      sub_location_id: row.checked_sub_location_id ?? null,
    })),
  };
}

export async function getOrCreateAntojadosRegistroCorpVerificationCrud(instanceId, {
  actorTenantUserId = null,
  requestId = null,
  correlationId = null,
} = {}) {
  const normalizedInstanceId = normalizeCode(instanceId);
  if (!normalizedInstanceId) {
    throw new Error("getOrCreateAntojadosRegistroCorpVerificationCrud: instanceId requerido");
  }

  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizedInstanceId)
    .input("actor_tenant_user_id", sql.NVarChar(64), normalizeCode(actorTenantUserId) || null)
    .input("request_id", sql.NVarChar(120), normalizeCode(requestId) || null)
    .input("correlation_id", sql.NVarChar(120), normalizeCode(correlationId) || null)
    .execute("antojados_core.sp_sys_registro_corp_verification_get_or_create_current");

  return result.recordset?.[0] || null;
}

export async function listAntojadosRegistroCorpVerificationChecksCrud(instanceId, verificationId) {
  const normalizedInstanceId = normalizeCode(instanceId);
  const normalizedVerificationId = normalizeCode(verificationId);
  if (!normalizedInstanceId) {
    throw new Error("listAntojadosRegistroCorpVerificationChecksCrud: instanceId requerido");
  }
  if (!normalizedVerificationId) {
    throw new Error("listAntojadosRegistroCorpVerificationChecksCrud: verificationId requerido");
  }

  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instanceId", sql.NVarChar(64), normalizedInstanceId)
    .input("verificationId", sql.NVarChar(64), normalizedVerificationId)
    .query(`
      SELECT
        c.check_id,
        c.verification_id,
        c.instance_id,
        c.check_code,
        c.check_required,
        c.check_state,
        c.checked_by_tenant_user_id,
        c.checked_at,
        c.evidence_ref,
        c.evidence_json,
        c.note,
        c.created_at,
        c.updated_at
      FROM antojados_core.sys_registro_corp_verification_check c
      WHERE c.instance_id = @instanceId
        AND c.verification_id = @verificationId
      ORDER BY c.check_code ASC;
    `);

  return result.recordset;
}

export async function upsertAntojadosRegistroCorpVerificationCheckCrud(instanceId, verificationId, {
  checkCode,
  checkState,
  actorTenantUserId = null,
  note = null,
  evidenceRef = null,
  evidenceJson = null,
  checkRequired = 1,
} = {}) {
  const normalizedInstanceId = normalizeCode(instanceId);
  const normalizedVerificationId = normalizeCode(verificationId);
  if (!normalizedInstanceId) {
    throw new Error("upsertAntojadosRegistroCorpVerificationCheckCrud: instanceId requerido");
  }
  if (!normalizedVerificationId) {
    throw new Error("upsertAntojadosRegistroCorpVerificationCheckCrud: verificationId requerido");
  }

  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizedInstanceId)
    .input("verification_id", sql.NVarChar(64), normalizedVerificationId)
    .input("check_code", sql.NVarChar(80), normalizeCode(checkCode))
    .input("check_state", sql.NVarChar(40), normalizeCode(checkState))
    .input("actor_tenant_user_id", sql.NVarChar(64), normalizeCode(actorTenantUserId) || null)
    .input("note", sql.NVarChar(sql.MAX), note ?? null)
    .input("evidence_ref", sql.NVarChar(500), evidenceRef ?? null)
    .input("evidence_json", sql.NVarChar(sql.MAX), evidenceJson ?? null)
    .input("check_required", sql.Bit, checkRequired ? 1 : 0)
    .execute("antojados_core.sp_sys_registro_corp_verification_upsert_check");

  return result.recordset?.[0] || null;
}

export async function decideAntojadosRegistroCorpVerificationCrud(instanceId, verificationId, {
  decisionState,
  decidedByTenantUserId,
  decisionNote = null,
  requestId = null,
  correlationId = null,
} = {}) {
  const normalizedInstanceId = normalizeCode(instanceId);
  const normalizedVerificationId = normalizeCode(verificationId);
  if (!normalizedInstanceId) {
    throw new Error("decideAntojadosRegistroCorpVerificationCrud: instanceId requerido");
  }
  if (!normalizedVerificationId) {
    throw new Error("decideAntojadosRegistroCorpVerificationCrud: verificationId requerido");
  }

  const pool = await getAntojadosPool();
  const result = await pool
    .request()
    .input("instance_id", sql.NVarChar(64), normalizedInstanceId)
    .input("verification_id", sql.NVarChar(64), normalizedVerificationId)
    .input("decision_state", sql.NVarChar(40), normalizeCode(decisionState))
    .input("decided_by_tenant_user_id", sql.NVarChar(64), normalizeCode(decidedByTenantUserId))
    .input("decision_note", sql.NVarChar(sql.MAX), decisionNote ?? null)
    .input("request_id", sql.NVarChar(120), normalizeCode(requestId) || null)
    .input("correlation_id", sql.NVarChar(120), normalizeCode(correlationId) || null)
    .execute("antojados_core.sp_sys_registro_corp_verification_decide");

  return result.recordset?.[0] || null;
}

