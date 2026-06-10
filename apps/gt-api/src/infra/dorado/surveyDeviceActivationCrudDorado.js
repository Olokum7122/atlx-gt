import { getAppPool, sqlType } from "../../db/sql.js";

const sql = sqlType();
const APP_SCHEMA = "core_encuestas";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeStatusCode(value) {
  return normalizeText(value).toLowerCase() || "pending";
}

function buildActivationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let chunk = "";
  for (let i = 0; i < 6; i += 1) {
    chunk += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `COL-${chunk}`;
}

function buildApprovedDeviceCode(activationCode) {
  return normalizeText(activationCode).toUpperCase();
}

async function ensureSurveyDeviceRegistryTable(connection) {
  await new sql.Request(connection).query(`
    IF OBJECT_ID('${APP_SCHEMA}.survey_device_registry', 'U') IS NULL
    BEGIN
      CREATE TABLE ${APP_SCHEMA}.survey_device_registry (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        device_code NVARCHAR(200) NOT NULL,
        device_name NVARCHAR(200) NOT NULL,
        user_ref NVARCHAR(120) NULL,
        group_code NVARCHAR(80) NULL,
        group_label NVARCHAR(200) NULL,
        context_code NVARCHAR(100) NULL,
        collect_delivery NVARCHAR(120) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_survey_device_registry_is_active DEFAULT (1),
        registered_at DATETIME2 NOT NULL CONSTRAINT DF_survey_device_registry_registered_at DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL CONSTRAINT DF_survey_device_registry_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NULL,
        channel_code NVARCHAR(40) NOT NULL CONSTRAINT DF_survey_device_registry_channel_code DEFAULT ('COLLECT')
      );

      CREATE UNIQUE INDEX UX_survey_device_registry_device_code
        ON ${APP_SCHEMA}.survey_device_registry (device_code);
    END

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'channel_code') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry
      ADD channel_code NVARCHAR(40) NOT NULL CONSTRAINT DF_survey_device_registry_channel_code_patch DEFAULT ('COLLECT');
  `);
}

async function ensureSurveyDeviceActivationTable(connection) {
  await new sql.Request(connection).query(`
    IF OBJECT_ID('${APP_SCHEMA}.survey_device_activation_requests', 'U') IS NULL
    BEGIN
      CREATE TABLE ${APP_SCHEMA}.survey_device_activation_requests (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        device_uuid NVARCHAR(120) NOT NULL,
        activation_code NVARCHAR(40) NOT NULL,
        requested_device_name NVARCHAR(200) NULL,
        app_version NVARCHAR(40) NULL,
        platform_code NVARCHAR(40) NULL,
        device_model NVARCHAR(200) NULL,
        status_code NVARCHAR(30) NOT NULL CONSTRAINT DF_survey_device_activation_requests_status DEFAULT ('pending'),
        approved_device_code NVARCHAR(200) NULL,
        approved_device_name NVARCHAR(200) NULL,
        approved_by NVARCHAR(120) NULL,
        approved_at DATETIME2 NULL,
        last_seen_at DATETIME2 NOT NULL CONSTRAINT DF_survey_device_activation_requests_last_seen DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL CONSTRAINT DF_survey_device_activation_requests_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_survey_device_activation_requests_updated DEFAULT SYSUTCDATETIME()
      );

      CREATE UNIQUE INDEX UX_survey_device_activation_requests_device_uuid
        ON ${APP_SCHEMA}.survey_device_activation_requests (device_uuid);

      CREATE UNIQUE INDEX UX_survey_device_activation_requests_activation_code
        ON ${APP_SCHEMA}.survey_device_activation_requests (activation_code);
    END

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'requested_device_name') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD requested_device_name NVARCHAR(200) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'app_version') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD app_version NVARCHAR(40) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'platform_code') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD platform_code NVARCHAR(40) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'device_model') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD device_model NVARCHAR(200) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'status_code') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD status_code NVARCHAR(30) NOT NULL CONSTRAINT DF_survey_device_activation_requests_status_patch DEFAULT ('pending');

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'approved_device_code') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD approved_device_code NVARCHAR(200) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'approved_device_name') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD approved_device_name NVARCHAR(200) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'approved_by') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD approved_by NVARCHAR(120) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'approved_at') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD approved_at DATETIME2 NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'last_seen_at') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD last_seen_at DATETIME2 NOT NULL CONSTRAINT DF_survey_device_activation_requests_last_seen_patch DEFAULT SYSUTCDATETIME();

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'created_at') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD created_at DATETIME2 NOT NULL CONSTRAINT DF_survey_device_activation_requests_created_patch DEFAULT SYSUTCDATETIME();

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_activation_requests', 'updated_at') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_activation_requests ADD updated_at DATETIME2 NOT NULL CONSTRAINT DF_survey_device_activation_requests_updated_patch DEFAULT SYSUTCDATETIME();
  `);
}

function mapActivationRow(row = {}) {
  const deviceUuid = normalizeText(row.device_uuid);
  if (!deviceUuid) return null;
  return {
    requestId: Number(row.id || 0),
    deviceUuid,
    activationCode: normalizeText(row.activation_code),
    requestedDeviceName: normalizeText(row.requested_device_name),
    appVersion: normalizeText(row.app_version),
    platformCode: normalizeText(row.platform_code),
    deviceModel: normalizeText(row.device_model),
    statusCode: normalizeStatusCode(row.status_code),
    approvedDeviceCode: normalizeText(row.approved_device_code),
    approvedDeviceName: normalizeText(row.approved_device_name),
    approvedBy: normalizeText(row.approved_by),
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

export async function requestCollectorDeviceActivationCrudDorado({
  deviceUuid,
  requestedDeviceName,
  appVersion,
  platformCode,
  deviceModel,
}) {
  const normalizedUuid = normalizeText(deviceUuid);
  if (!normalizedUuid) {
    throw new Error("device_uuid requerido");
  }

  const pool = await getAppPool();
  await ensureSurveyDeviceActivationTable(pool);

  const existingResult = await pool.request()
    .input("device_uuid", sql.NVarChar(120), normalizedUuid)
    .query(`
      SELECT TOP (1) *
      FROM ${APP_SCHEMA}.survey_device_activation_requests
      WHERE device_uuid = @device_uuid;
    `);

  const existing = existingResult.recordset?.[0] || null;
  if (existing) {
    await pool.request()
      .input("device_uuid", sql.NVarChar(120), normalizedUuid)
      .input("requested_device_name", sql.NVarChar(200), normalizeText(requestedDeviceName) || null)
      .input("app_version", sql.NVarChar(40), normalizeText(appVersion) || null)
      .input("platform_code", sql.NVarChar(40), normalizeText(platformCode) || null)
      .input("device_model", sql.NVarChar(200), normalizeText(deviceModel) || null)
      .query(`
        UPDATE ${APP_SCHEMA}.survey_device_activation_requests
        SET
          requested_device_name = COALESCE(@requested_device_name, requested_device_name),
          app_version = COALESCE(@app_version, app_version),
          platform_code = COALESCE(@platform_code, platform_code),
          device_model = COALESCE(@device_model, device_model),
          last_seen_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
        WHERE device_uuid = @device_uuid;
      `);

    const refreshed = await pool.request()
      .input("device_uuid", sql.NVarChar(120), normalizedUuid)
      .query(`SELECT TOP (1) * FROM ${APP_SCHEMA}.survey_device_activation_requests WHERE device_uuid = @device_uuid;`);
    return mapActivationRow(refreshed.recordset?.[0] || existing);
  }

  let activationCode = buildActivationCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const insert = await pool.request()
        .input("device_uuid", sql.NVarChar(120), normalizedUuid)
        .input("activation_code", sql.NVarChar(40), activationCode)
        .input("requested_device_name", sql.NVarChar(200), normalizeText(requestedDeviceName) || null)
        .input("app_version", sql.NVarChar(40), normalizeText(appVersion) || null)
        .input("platform_code", sql.NVarChar(40), normalizeText(platformCode) || null)
        .input("device_model", sql.NVarChar(200), normalizeText(deviceModel) || null)
        .query(`
          INSERT INTO ${APP_SCHEMA}.survey_device_activation_requests
          (
            device_uuid,
            activation_code,
            requested_device_name,
            app_version,
            platform_code,
            device_model,
            status_code,
            last_seen_at,
            created_at,
            updated_at
          )
          OUTPUT inserted.*
          VALUES
          (
            @device_uuid,
            @activation_code,
            @requested_device_name,
            @app_version,
            @platform_code,
            @device_model,
            'pending',
            SYSUTCDATETIME(),
            SYSUTCDATETIME(),
            SYSUTCDATETIME()
          );
        `);
      return mapActivationRow(insert.recordset?.[0] || {});
    } catch (error) {
      if (/activation_code/i.test(String(error?.message || "")) && attempt < 4) {
        activationCode = buildActivationCode();
        continue;
      }
      throw error;
    }
  }

  throw new Error("No fue posible generar activation_code unico");
}

export async function getCollectorDeviceActivationStatusCrudDorado(deviceUuid) {
  const normalizedUuid = normalizeText(deviceUuid);
  if (!normalizedUuid) {
    throw new Error("device_uuid requerido");
  }

  const pool = await getAppPool();
  await ensureSurveyDeviceActivationTable(pool);
  const result = await pool.request()
    .input("device_uuid", sql.NVarChar(120), normalizedUuid)
    .query(`
      SELECT TOP (1) *
      FROM ${APP_SCHEMA}.survey_device_activation_requests
      WHERE device_uuid = @device_uuid;
    `);

  const row = result.recordset?.[0] || null;
  return row ? mapActivationRow(row) : null;
}

export async function listCollectorDeviceActivationRequestsCrudDorado(statusCode = "pending") {
  const pool = await getAppPool();
  await ensureSurveyDeviceActivationTable(pool);
  const normalizedStatus = normalizeStatusCode(statusCode);
  const request = pool.request();
  let whereClause = "";
  if (normalizedStatus !== "all") {
    request.input("status_code", sql.NVarChar(30), normalizedStatus);
    whereClause = "WHERE status_code = @status_code";
  }

  const result = await request.query(`
    SELECT *
    FROM ${APP_SCHEMA}.survey_device_activation_requests
    ${whereClause}
    ORDER BY
      CASE WHEN status_code = 'pending' THEN 0 ELSE 1 END,
      last_seen_at DESC,
      id DESC;
  `);

  return (result.recordset || []).map(mapActivationRow).filter(Boolean);
}

export async function approveCollectorDeviceActivationCrudDorado({
  deviceUuid,
  deviceName,
  userRef,
  groupCode,
  groupLabel,
  contextCode,
  requestContext = {},
}) {
  const normalizedUuid = normalizeText(deviceUuid);
  if (!normalizedUuid) {
    throw new Error("device_uuid requerido");
  }

  const pool = await getAppPool();
  await ensureSurveyDeviceActivationTable(pool);
  await ensureSurveyDeviceRegistryTable(pool);

  const existing = await getCollectorDeviceActivationStatusCrudDorado(normalizedUuid);
  if (!existing) {
    throw new Error("Solicitud de activacion no encontrada");
  }

  const approvedDeviceCode = existing.approvedDeviceCode || buildApprovedDeviceCode(existing.activationCode);
  const approvedDeviceName = normalizeText(deviceName) || existing.requestedDeviceName || approvedDeviceCode;
  const actorId = normalizeText(requestContext.actorId) || "survey-admin";

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input("device_code", sql.NVarChar(200), approvedDeviceCode)
      .input("device_name", sql.NVarChar(200), approvedDeviceName)
      .input("user_ref", sql.NVarChar(120), normalizeText(userRef) || null)
      .input("group_code", sql.NVarChar(80), normalizeText(groupCode) || null)
      .input("group_label", sql.NVarChar(200), normalizeText(groupLabel) || null)
      .input("context_code", sql.NVarChar(100), normalizeText(contextCode) || "campo")
      .input("collect_delivery", sql.NVarChar(120), "Sincronizacion administrada")
      .input("channel_code", sql.NVarChar(40), "COLLECT")
      .query(`
        MERGE ${APP_SCHEMA}.survey_device_registry AS tgt
        USING (
          SELECT
            @device_code AS device_code,
            @device_name AS device_name,
            @user_ref AS user_ref,
            @group_code AS group_code,
            @group_label AS group_label,
            @context_code AS context_code,
            @collect_delivery AS collect_delivery,
            @channel_code AS channel_code
        ) AS src
        ON tgt.device_code = src.device_code
        WHEN MATCHED THEN UPDATE SET
          device_name = src.device_name,
          user_ref = src.user_ref,
          group_code = src.group_code,
          group_label = src.group_label,
          context_code = src.context_code,
          collect_delivery = src.collect_delivery,
          channel_code = src.channel_code,
          is_active = 1,
          updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT
        (
          device_code,
          device_name,
          user_ref,
          group_code,
          group_label,
          context_code,
          collect_delivery,
          channel_code,
          is_active,
          registered_at,
          created_at
        ) VALUES
        (
          src.device_code,
          src.device_name,
          src.user_ref,
          src.group_code,
          src.group_label,
          src.context_code,
          src.collect_delivery,
          src.channel_code,
          1,
          SYSUTCDATETIME(),
          SYSUTCDATETIME()
        );
      `);

    const update = await new sql.Request(tx)
      .input("device_uuid", sql.NVarChar(120), normalizedUuid)
      .input("approved_device_code", sql.NVarChar(200), approvedDeviceCode)
      .input("approved_device_name", sql.NVarChar(200), approvedDeviceName)
      .input("approved_by", sql.NVarChar(120), actorId)
      .query(`
        UPDATE ${APP_SCHEMA}.survey_device_activation_requests
        SET
          status_code = 'approved',
          approved_device_code = @approved_device_code,
          approved_device_name = @approved_device_name,
          approved_by = @approved_by,
          approved_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME(),
          last_seen_at = SYSUTCDATETIME()
        OUTPUT inserted.*
        WHERE device_uuid = @device_uuid;
      `);

    await tx.commit();
    return mapActivationRow(update.recordset?.[0] || {});
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function cancelCollectorDeviceActivationCrudDorado({
  deviceUuid,
  requestContext = {},
}) {
  const normalizedUuid = normalizeText(deviceUuid);
  if (!normalizedUuid) {
    throw new Error("device_uuid requerido");
  }

  const pool = await getAppPool();
  await ensureSurveyDeviceActivationTable(pool);

  const actorId = normalizeText(requestContext.actorId) || "survey-admin";
  const result = await pool.request()
    .input("device_uuid", sql.NVarChar(120), normalizedUuid)
    .input("approved_by", sql.NVarChar(120), actorId)
    .query(`
      UPDATE ${APP_SCHEMA}.survey_device_activation_requests
      SET
        status_code = 'cancelled',
        approved_by = @approved_by,
        updated_at = SYSUTCDATETIME(),
        last_seen_at = SYSUTCDATETIME()
      OUTPUT inserted.*
      WHERE device_uuid = @device_uuid
        AND status_code = 'pending';
    `);

  const row = mapActivationRow(result.recordset?.[0] || {});
  if (!row) {
    throw new Error("Solo se pueden cancelar solicitudes pendientes");
  }
  return row;
}

export async function revokeCollectorRegisteredDeviceCrudDorado({
  deviceCode,
  requestContext = {},
}) {
  const normalizedDeviceCode = normalizeText(deviceCode);
  if (!normalizedDeviceCode) {
    throw new Error("device_code requerido");
  }

  const pool = await getAppPool();
  await ensureSurveyDeviceActivationTable(pool);
  await ensureSurveyDeviceRegistryTable(pool);

  const actorId = normalizeText(requestContext.actorId) || "survey-admin";
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const registryUpdate = await new sql.Request(tx)
      .input("device_code", sql.NVarChar(200), normalizedDeviceCode)
      .query(`
        UPDATE ${APP_SCHEMA}.survey_device_registry
        SET
          is_active = 0,
          updated_at = SYSUTCDATETIME()
        OUTPUT inserted.device_code
        WHERE device_code = @device_code
          AND is_active = 1;
      `);

    if (!registryUpdate.recordset?.length) {
      throw new Error("Dispositivo no encontrado o ya inactivo");
    }

    await new sql.Request(tx)
      .input("approved_device_code", sql.NVarChar(200), normalizedDeviceCode)
      .input("approved_by", sql.NVarChar(120), actorId)
      .query(`
        UPDATE ${APP_SCHEMA}.survey_device_activation_requests
        SET
          status_code = 'revoked',
          approved_by = @approved_by,
          updated_at = SYSUTCDATETIME(),
          last_seen_at = SYSUTCDATETIME()
        WHERE approved_device_code = @approved_device_code
          AND status_code = 'approved';
      `);

    await tx.commit();
    return {
      deviceCode: normalizedDeviceCode,
      statusCode: 'revoked',
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
