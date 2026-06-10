import { getAppPool, sqlType } from "../../db/sql.js";

const sql = sqlType();
const APP_SCHEMA = "core_encuestas";

const FALLBACK_DEVICE_TARGETS = [
  {
    id: "GA8N2",
    name: "GA8N2",
    owner: "Dispositivo de campo",
    collectDelivery: "Sincronizacion administrada",
    surveyAssignment: "Pendiente",
  },
  {
    id: "brigada-norte-01",
    name: "Brigada Norte 01",
    owner: "Supervisor de campo",
    collectDelivery: "Sincronizacion administrada",
    surveyAssignment: "Pendiente",
  },
  {
    id: "entrevistador-centro-02",
    name: "Entrevistador Centro 02",
    owner: "Promotor territorial",
    collectDelivery: "Play Store administrado",
    surveyAssignment: "Pendiente",
  },
  {
    id: "auditoria-sur-03",
    name: "Auditoria Sur 03",
    owner: "Auditor operativo",
    collectDelivery: "Sincronizacion administrada",
    surveyAssignment: "Pendiente",
  },
];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeExecutableChannelCode(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (["collector", "device", "mobile"].includes(normalized)) return "collector";
  if (["tenant", "tenants"].includes(normalized)) return "tenant";
  return "web";
}

function buildExecutableCode(executableId, docId, version, channelCode, docCode) {
  const normalizedChannel = normalizeExecutableChannelCode(channelCode);
  const channel =
    normalizedChannel === "collector"
      ? "COL"
      : normalizedChannel === "tenant"
        ? "TEN"
        : "WEB";
  // Usar número secuencial del docCode (e.g. DOC-ENC-0005 → 5) en lugar del docId DB
  const codeMatch = String(docCode || "").match(/(\d+)$/);
  const docNum = codeMatch ? Number(codeMatch[1]) : Number(docId);
  return `EXE-${channel}-ENC-${String(docNum).padStart(4, "0")}-V${String(version).padStart(2, "0")}-R${String(executableId).padStart(4, "0")}`;
}

function buildPublicUrl(executableCode) {
  return `/encuestas/open/${encodeURIComponent(executableCode)}`;
}

function buildTransitionNote(actionCode, transitionNote, channelCode, correlationId) {
  const parts = [
    `action=${normalizeText(actionCode).toLowerCase()}`,
    `channel=${normalizeText(channelCode) || "mixed"}`,
    `corr=${normalizeText(correlationId) || "none"}`,
    `note=${normalizeText(transitionNote) || ""}`,
  ];
  return parts.join("|");
}

function parseTransitionMeta(notes) {
  const parsed = {};
  String(notes || "")
    .split("|")
    .forEach((token) => {
      const idx = token.indexOf("=");
      if (idx <= 0) return;
      parsed[token.slice(0, idx)] = token.slice(idx + 1);
    });
  return parsed;
}

async function ensureSurveyExecutableChannelColumn(connection) {
  await new sql.Request(connection).query(`
    IF COL_LENGTH('${APP_SCHEMA}.survey_executables', 'channel_code') IS NULL
    BEGIN
      ALTER TABLE ${APP_SCHEMA}.survey_executables
      ADD channel_code NVARCHAR(30) NOT NULL
        CONSTRAINT DF_survey_executables_channel_code DEFAULT ('web');
    END
  `);
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
        updated_at DATETIME2 NULL
      );

      CREATE UNIQUE INDEX UX_survey_device_registry_device_code
        ON ${APP_SCHEMA}.survey_device_registry (device_code);
    END

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'user_ref') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry ADD user_ref NVARCHAR(120) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'group_code') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry ADD group_code NVARCHAR(80) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'group_label') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry ADD group_label NVARCHAR(200) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'context_code') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry ADD context_code NVARCHAR(100) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'collect_delivery') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry ADD collect_delivery NVARCHAR(120) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'is_active') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry
      ADD is_active BIT NOT NULL CONSTRAINT DF_survey_device_registry_is_active_patch DEFAULT (1);

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'registered_at') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry
      ADD registered_at DATETIME2 NOT NULL CONSTRAINT DF_survey_device_registry_registered_at_patch DEFAULT SYSUTCDATETIME();

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'created_at') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry
      ADD created_at DATETIME2 NOT NULL CONSTRAINT DF_survey_device_registry_created_at_patch DEFAULT SYSUTCDATETIME();

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'updated_at') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry ADD updated_at DATETIME2 NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_device_registry', 'channel_code') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_device_registry
      ADD channel_code NVARCHAR(40) NOT NULL CONSTRAINT DF_survey_device_registry_channel_code DEFAULT ('COLLECT');
  `);
}

async function ensureSurveyAdminTransitionsTable(connection) {
  await new sql.Request(connection).query(`
    IF OBJECT_ID('${APP_SCHEMA}.survey_admin_transitions', 'U') IS NULL
    BEGIN
      CREATE TABLE ${APP_SCHEMA}.survey_admin_transitions (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        doc_id INT NOT NULL,
        executable_id INT NULL,
        from_status NVARCHAR(50) NOT NULL,
        to_status NVARCHAR(50) NOT NULL,
        transitioned_by NVARCHAR(100) NOT NULL,
        transitioned_at DATETIME2 NOT NULL,
        notes NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL
      );

      CREATE INDEX IX_survey_admin_transitions_doc_id
        ON ${APP_SCHEMA}.survey_admin_transitions (doc_id, transitioned_at DESC);

      CREATE INDEX IX_survey_admin_transitions_executable_id
        ON ${APP_SCHEMA}.survey_admin_transitions (executable_id, transitioned_at DESC);
    END

    IF COL_LENGTH('${APP_SCHEMA}.survey_admin_transitions', 'id') IS NULL
    BEGIN
      ALTER TABLE ${APP_SCHEMA}.survey_admin_transitions
      ADD id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_survey_admin_transitions PRIMARY KEY;
    END

    IF COL_LENGTH('${APP_SCHEMA}.survey_admin_transitions', 'doc_id') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_admin_transitions ADD doc_id INT NOT NULL DEFAULT 0;

    IF COL_LENGTH('${APP_SCHEMA}.survey_admin_transitions', 'executable_id') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_admin_transitions ADD executable_id INT NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_admin_transitions', 'from_status') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_admin_transitions ADD from_status NVARCHAR(50) NOT NULL DEFAULT '';

    IF COL_LENGTH('${APP_SCHEMA}.survey_admin_transitions', 'to_status') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_admin_transitions ADD to_status NVARCHAR(50) NOT NULL DEFAULT '';

    IF COL_LENGTH('${APP_SCHEMA}.survey_admin_transitions', 'transitioned_by') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_admin_transitions ADD transitioned_by NVARCHAR(100) NOT NULL DEFAULT 'system';

    IF COL_LENGTH('${APP_SCHEMA}.survey_admin_transitions', 'transitioned_at') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_admin_transitions ADD transitioned_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();

    IF COL_LENGTH('${APP_SCHEMA}.survey_admin_transitions', 'notes') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_admin_transitions ADD notes NVARCHAR(MAX) NULL;

    IF COL_LENGTH('${APP_SCHEMA}.survey_admin_transitions', 'created_at') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_admin_transitions ADD created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'IX_survey_admin_transitions_executable_id'
        AND object_id = OBJECT_ID('${APP_SCHEMA}.survey_admin_transitions')
    )
      CREATE INDEX IX_survey_admin_transitions_executable_id
        ON ${APP_SCHEMA}.survey_admin_transitions (executable_id, transitioned_at DESC);
  `);
}

function resolveDistributionChannel({ assignCount = 0, collectQueuedCount = 0 } = {}) {
  if (Number(collectQueuedCount || 0) > 0) return "collector";
  if (Number(assignCount || 0) > 0) return "tenant";
  return "web";
}

async function getDocHeader(transaction, docId) {
  const result = await new sql.Request(transaction)
    .input("doc_id", sql.Int, docId)
    .query(`
      SELECT
        id,
        code,
        title,
        objective,
        audience,
        status,
        is_active
      FROM ${APP_SCHEMA}.survey_docs
      WHERE id = @doc_id;
    `);
  return result.recordset?.[0] || null;
}

async function getDocLinesForPublication(transaction, docId) {
  const result = await new sql.Request(transaction)
    .input("doc_id", sql.Int, docId)
    .query(`
      SELECT
        dl.id,
        dl.line_order,
        dl.section_type,
        dl.question_text,
        dl.response_profile_id,
        dl.response_profile_code,
        p.input_type,
        n.id AS profile_numeric_id,
        CASE
          WHEN n.numeric_value_decimal IS NOT NULL THEN 'decimal'
          ELSE 'integer'
        END AS numeric_kind
      FROM ${APP_SCHEMA}.survey_doclines dl
      LEFT JOIN ${APP_SCHEMA}.survey_response_profiles p
        ON p.id = dl.response_profile_id
      LEFT JOIN ${APP_SCHEMA}.survey_response_profile_numerics n
        ON n.profile_id = dl.response_profile_id
      WHERE dl.doc_id = @doc_id
        AND dl.is_active = 1
      ORDER BY dl.line_order, dl.id;
    `);
  return result.recordset || [];
}

async function getLikertOptions(transaction, responseProfileId) {
  const result = await new sql.Request(transaction)
    .input("profile_id", sql.Int, responseProfileId)
    .query(`
      SELECT TOP (1)
        option_1_label,
        option_2_label,
        option_3_label,
        option_4_label,
        option_5_label
      FROM ${APP_SCHEMA}.survey_response_profile_likerts
      WHERE profile_id = @profile_id
      ORDER BY id DESC;
    `);

  const row = result.recordset?.[0];
  if (!row) return [];

  return [
    row.option_1_label,
    row.option_2_label,
    row.option_3_label,
    row.option_4_label,
    row.option_5_label,
  ]
    .map((label, i) => ({
      value: String(i + 1),
      label: normalizeText(label),
      sort: i + 1,
    }))
    .filter((item) => item.label);
}

async function getChoiceOptions(transaction, responseProfileId) {
  const result = await new sql.Request(transaction)
    .input("profile_id", sql.Int, responseProfileId)
    .query(`
      SELECT
        option_value,
        option_label,
        sort_order
      FROM ${APP_SCHEMA}.survey_response_profile_options
      WHERE profile_id = @profile_id
        AND is_active = 1
      ORDER BY sort_order, id;
    `);

  return (result.recordset || []).map((row) => ({
    value: normalizeText(row.option_value),
    label: normalizeText(row.option_label),
    sort: Number(row.sort_order || 0),
  }));
}

async function getNumericBuckets(transaction, profileNumericId) {
  if (!profileNumericId) return [];
  const result = await new sql.Request(transaction)
    .input("profile_numeric_id", sql.Int, profileNumericId)
    .query(`
      SELECT
        bucket_min,
        bucket_max,
        bucket_label,
        sort_order
      FROM ${APP_SCHEMA}.survey_response_profile_numeric_buckets
      WHERE profile_numeric_id = @profile_numeric_id
      ORDER BY sort_order, id;
    `);

  return result.recordset || [];
}

async function insertExecutableLine(transaction, executableId, line) {
  const questionType = normalizeText(line.section_type) || "text";
  const result = await new sql.Request(transaction)
    .input("executable_id", sql.Int, executableId)
    .input("question_text", sql.NVarChar(sql.MAX), normalizeText(line.question_text))
    .input("question_type", sql.NVarChar(50), questionType)
    .input("sort_order", sql.Int, Number(line.line_order || 0) || 1)
    .input("response_profile_id", sql.Int, Number(line.response_profile_id || 0) || null)
    .query(`
      INSERT INTO ${APP_SCHEMA}.survey_executablelines
      (
        executable_id,
        question_text,
        question_type,
        sort_order,
        is_required,
        response_profile_id,
        created_at
      )
      OUTPUT inserted.id AS executableline_id
      VALUES
      (
        @executable_id,
        @question_text,
        @question_type,
        @sort_order,
        1,
        @response_profile_id,
        SYSUTCDATETIME()
      );
    `);

  return Number(result.recordset?.[0]?.executableline_id || 0);
}

async function insertExecutableOptions(transaction, executableLineId, options = []) {
  let count = 0;
  for (const option of options) {
    await new sql.Request(transaction)
      .input("executableline_id", sql.Int, executableLineId)
      .input("option_value", sql.NVarChar(100), normalizeText(option.value))
      .input("option_label", sql.NVarChar(200), normalizeText(option.label))
      .input("sort_order", sql.Int, Number(option.sort || 0) || 1)
      .query(`
        INSERT INTO ${APP_SCHEMA}.survey_executableline_options
        (
          executableline_id,
          option_value,
          option_label,
          sort_order,
          created_at
        )
        VALUES
        (
          @executableline_id,
          @option_value,
          @option_label,
          @sort_order,
          SYSUTCDATETIME()
        );
      `);
    count += 1;
  }
  return count;
}

async function insertExecutableNumericBuckets(transaction, executableLineId, buckets = []) {
  let count = 0;
  for (const bucket of buckets) {
    await new sql.Request(transaction)
      .input("executableline_id", sql.Int, executableLineId)
      .input("bucket_min", sql.Decimal(18, 4), bucket.bucket_min == null ? null : Number(bucket.bucket_min))
      .input("bucket_max", sql.Decimal(18, 4), bucket.bucket_max == null ? null : Number(bucket.bucket_max))
      .input("bucket_label", sql.NVarChar(200), normalizeText(bucket.bucket_label))
      .input("sort_order", sql.Int, Number(bucket.sort_order || 0) || 1)
      .query(`
        INSERT INTO ${APP_SCHEMA}.survey_executableline_numeric_buckets
        (
          executableline_id,
          bucket_min,
          bucket_max,
          bucket_label,
          sort_order,
          created_at
        )
        VALUES
        (
          @executableline_id,
          @bucket_min,
          @bucket_max,
          @bucket_label,
          @sort_order,
          SYSUTCDATETIME()
        );
      `);
    count += 1;
  }
  return count;
}

export async function getLatestExecutableByDocIdCrudDorado(docId, options = {}) {
  const normalizedDocId = Number(docId);
  if (!Number.isFinite(normalizedDocId) || normalizedDocId <= 0) {
    throw new Error("Identificador de encuesta invalido");
  }

  const normalizedChannelCode = normalizeExecutableChannelCode(options?.channelCode || "web");
  const pool = await getAppPool();
  await ensureSurveyExecutableChannelColumn(pool);
  const result = await pool.request()
    .input("doc_id", sql.Int, normalizedDocId)
    .input("channel_code", sql.NVarChar(30), normalizedChannelCode)
    .query(`
      SELECT TOP (1)
        e.id,
        e.doc_id,
        e.channel_code,
        e.version_number,
        e.is_active,
        e.published_at,
        e.created_at,
        d.code AS doc_code
      FROM ${APP_SCHEMA}.survey_executables e
      LEFT JOIN ${APP_SCHEMA}.survey_docs d
        ON d.id = e.doc_id
      WHERE e.doc_id = @doc_id
        AND e.channel_code = @channel_code
      ORDER BY e.version_number DESC, e.id DESC;
    `);

  const row = result.recordset?.[0];
  if (!row) return null;

  const executableId = Number(row.id || 0);
  const docCode = String(row.doc_code || "");
  const version = Number(row.version_number || 1);
  const channelCode = normalizeExecutableChannelCode(row.channel_code || normalizedChannelCode);
  const code = buildExecutableCode(executableId, normalizedDocId, version, channelCode, docCode);
  return {
    executableId,
    executableCode: code,
    channelCode,
    publicationStatus: Number(row.is_active ?? 0) === 1 ? "available" : "retired",
    publicationVersion: version,
    publishedAt: row.published_at ? String(row.published_at) : null,
    isActive: Number(row.is_active ?? 0) === 1,
    publicUrl: buildPublicUrl(code),
  };
}

export async function publishSurveyDocCrudDorado({ docId, publishedBy, channelCode = "web" }) {
  const normalizedDocId = Number(docId);
  if (!Number.isFinite(normalizedDocId) || normalizedDocId <= 0) {
    throw new Error("Identificador de encuesta invalido");
  }

  const normalizedChannelCode = normalizeExecutableChannelCode(channelCode);
  const pool = await getAppPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await ensureSurveyExecutableChannelColumn(transaction);

    const header = await getDocHeader(transaction, normalizedDocId);
    if (!header || Number(header.is_active ?? 0) !== 1) {
      throw new Error("Encuesta no encontrada para publicar");
    }
    const docCode = String(header.code || "");

    const lines = await getDocLinesForPublication(transaction, normalizedDocId);
    if (!lines.length) {
      throw new Error("No se puede montar/publicar sin reactivos");
    }

    const versionResult = await new sql.Request(transaction)
      .input("doc_id", sql.Int, normalizedDocId)
      .input("channel_code", sql.NVarChar(30), normalizedChannelCode)
      .query(`
        SELECT ISNULL(MAX(version_number), 0) + 1 AS next_version
        FROM ${APP_SCHEMA}.survey_executables
        WHERE doc_id = @doc_id
          AND channel_code = @channel_code;
      `);
    const nextVersion = Number(versionResult.recordset?.[0]?.next_version || 1);

    await new sql.Request(transaction)
      .input("doc_id", sql.Int, normalizedDocId)
      .input("channel_code", sql.NVarChar(30), normalizedChannelCode)
      .query(`
        UPDATE ${APP_SCHEMA}.survey_executables
        SET is_active = 0
        WHERE doc_id = @doc_id
          AND channel_code = @channel_code
          AND is_active = 1;
      `);

    const executableInsert = await new sql.Request(transaction)
      .input("doc_id", sql.Int, normalizedDocId)
      .input("channel_code", sql.NVarChar(30), normalizedChannelCode)
      .input("version_number", sql.Int, nextVersion)
      .query(`
        INSERT INTO ${APP_SCHEMA}.survey_executables
        (
          doc_id,
          channel_code,
          version_number,
          is_active,
          published_at,
          created_at
        )
        OUTPUT inserted.id
        VALUES
        (
          @doc_id,
          @channel_code,
          @version_number,
          1,
          SYSUTCDATETIME(),
          SYSUTCDATETIME()
        );
      `);

    const executableId = Number(executableInsert.recordset?.[0]?.id || 0);
    if (!executableId) {
      throw new Error("No fue posible crear ejecutable");
    }

    let optionCount = 0;
    let bucketCount = 0;
    for (const line of lines) {
      const executableLineId = await insertExecutableLine(transaction, executableId, line);
      const sectionType = normalizeText(line.section_type).toLowerCase();

      if (sectionType === "likert") {
        const likertOptions = await getLikertOptions(transaction, Number(line.response_profile_id || 0));
        optionCount += await insertExecutableOptions(transaction, executableLineId, likertOptions);
      } else if (sectionType === "multi" || sectionType === "unica") {
        const choiceOptions = await getChoiceOptions(transaction, Number(line.response_profile_id || 0));
        optionCount += await insertExecutableOptions(transaction, executableLineId, choiceOptions);
      }

      if (Number(line.profile_numeric_id || 0) > 0) {
        const buckets = await getNumericBuckets(transaction, Number(line.profile_numeric_id || 0));
        bucketCount += await insertExecutableNumericBuckets(transaction, executableLineId, buckets);
      }
    }

    await new sql.Request(transaction)
      .input("doc_id", sql.Int, normalizedDocId)
      .query(`
        UPDATE ${APP_SCHEMA}.survey_docs
        SET
          status = 'ready',
          updated_at = SYSUTCDATETIME()
        WHERE id = @doc_id;
      `);

    await transaction.commit();

    const executableCode = buildExecutableCode(
      executableId,
      normalizedDocId,
      nextVersion,
      normalizedChannelCode,
      docCode,
    );
    return {
      executableId,
      executableCode,
      channelCode: normalizedChannelCode,
      publicationStatus: "available",
      publicationVersion: nextVersion,
      lineCount: lines.length,
      optionCount,
      bucketCount,
      publicUrl: buildPublicUrl(executableCode),
      publishedBy: normalizeText(publishedBy) || "survey-admin",
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function resolveDeviceRegistryRows(channelCode) {
  const appPool = await getAppPool();
  await ensureSurveyDeviceRegistryTable(appPool);
  const columnsResult = await appPool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'core_encuestas'
      AND TABLE_NAME = 'survey_device_registry';
  `);

  const columns = new Set((columnsResult.recordset || []).map((row) => String(row.COLUMN_NAME || "")));
  if (!columns.size) {
    return [];
  }

  const hasIsActive = columns.has("is_active");
  const hasChannelCode = columns.has("channel_code");
  const normalizedChannel = channelCode ? String(channelCode).trim().toUpperCase() : null;

  const request = appPool.request();
  let whereClause = hasIsActive ? "WHERE is_active = 1" : "";
  if (normalizedChannel && hasChannelCode) {
    request.input("channel_code_filter", sql.NVarChar(40), normalizedChannel);
    whereClause = whereClause
      ? `${whereClause} AND channel_code = @channel_code_filter`
      : "WHERE channel_code = @channel_code_filter";
  }

  const result = await request.query(`
    SELECT
      id,
      device_code,
      device_name,
      user_ref,
      group_code,
      group_label,
      context_code,
      collect_delivery,
      is_active,
      channel_code
    FROM core_encuestas.survey_device_registry
    ${whereClause}
    ORDER BY device_name, device_code;
  `);

  return result.recordset || [];
}

function mapDeviceRegistryRow(row = {}) {
  const id = normalizeText(row.device_code || row.device_ref || row.device_id || row.code || row.sync_device_code || String(row.id || ""));
  if (!id) return null;

  return {
    id,
    name: normalizeText(row.device_name || row.display_name || row.device_label || id),
    owner: normalizeText(row.user_ref || row.owner_name || row.assigned_to || row.tenant_id || "Responsable operativo"),
    collectDelivery: normalizeText(row.collect_delivery || row.context_code || row.channel_mode || "Sincronizacion administrada"),
    userRef: normalizeText(row.user_ref),
    groupCode: normalizeText(row.group_code),
    groupLabel: normalizeText(row.group_label),
    contextCode: normalizeText(row.context_code),
    channelCode: normalizeText(row.channel_code) || "COLLECT",
    surveyAssignment: "Pendiente",
  };
}

export async function listSurveyDeviceTargetsCrudDorado(channelCode) {
  try {
    const rows = await resolveDeviceRegistryRows(channelCode);
    const mapped = rows.map(mapDeviceRegistryRow).filter(Boolean);
    if (mapped.length) return mapped;
  } catch (_error) {
    // fallback below
  }
  return FALLBACK_DEVICE_TARGETS;
}

export async function generateSurveyPublicUrlCrudDorado(docId) {
  const latest = await getLatestExecutableByDocIdCrudDorado(docId, { channelCode: "web" });
  if (!latest || !latest.isActive) {
    throw new Error("No existe ejecutable activo para emitir URL");
  }

  return {
    executableId: latest.executableId,
    executableCode: latest.executableCode,
    channelCode: "web",
    publicationVersion: latest.publicationVersion,
    publicUrl: latest.publicUrl,
  };
}

export async function loadCollectForSurveyCrudDorado({ docId, device, requestContext = {} }) {
  const latest = await getLatestExecutableByDocIdCrudDorado(docId, {
    channelCode: "collector",
  });
  if (!latest || !latest.isActive) {
    throw new Error("Genera primero un ejecutable activo");
  }

  const normalizedDevice = {
    id: normalizeText(device?.id),
    name: normalizeText(device?.name),
    owner: normalizeText(device?.owner),
    collectDelivery: normalizeText(device?.collectDelivery),
  };
  if (!normalizedDevice.id) {
    throw new Error("Dispositivo destino invalido");
  }

  const pool = await getAppPool();
  await pool.request().query(`
    IF COL_LENGTH('${APP_SCHEMA}.survey_collect_operations', 'channel_code') IS NULL
      ALTER TABLE ${APP_SCHEMA}.survey_collect_operations
      ADD channel_code NVARCHAR(40) NULL;
  `);
  const channelCodeValue = normalizeText(device?.channelCode) || "COLLECT";
  const ticket = `collect-${latest.executableId}-${normalizedDevice.id}-${Date.now()}`;
  const insert = await pool.request()
    .input("executable_id", sql.Int, latest.executableId)
    .input("operation_type", sql.NVarChar(120), "queued_load_collect")
    .input("operated_by", sql.NVarChar(120), normalizeText(requestContext.actorId) || "survey-admin")
    .input("channel_code", sql.NVarChar(40), channelCodeValue)
    .input("notes", sql.NVarChar(sql.MAX), `ticket=${ticket}|device=${normalizedDevice.id}|channel=${channelCodeValue}`)
    .query(`
      INSERT INTO ${APP_SCHEMA}.survey_collect_operations
      (
        executable_id,
        operation_type,
        operated_by,
        operated_at,
        notes,
        channel_code,
        created_at
      )
      OUTPUT inserted.id
      VALUES
      (
        @executable_id,
        @operation_type,
        @operated_by,
        SYSUTCDATETIME(),
        @notes,
        @channel_code,
        SYSUTCDATETIME()
      );
    `);

  return {
    collectOperationId: Number(insert.recordset?.[0]?.id || 0),
    executableId: latest.executableId,
    executableCode: latest.executableCode,
    device: normalizedDevice,
    status: "queued",
    operation: "load_collect",
    ticket,
  };
}

export async function assignSurveyToDeviceCrudDorado({ docId, device, requestContext = {} }) {
  const latest = await getLatestExecutableByDocIdCrudDorado(docId, {
    channelCode: "tenant",
  });
  if (!latest || !latest.isActive) {
    throw new Error("Genera primero un ejecutable activo");
  }

  const normalizedDevice = {
    id: normalizeText(device?.id),
    name: normalizeText(device?.name),
    owner: normalizeText(device?.owner),
    collectDelivery: normalizeText(device?.collectDelivery),
    userRef: normalizeText(device?.userRef || device?.owner),
    groupCode: normalizeText(device?.groupCode),
    groupLabel: normalizeText(device?.groupLabel),
    contextCode: normalizeText(device?.contextCode),
  };
  if (!normalizedDevice.id) {
    throw new Error("Dispositivo destino invalido");
  }

  const pool = await getAppPool();
  await ensureSurveyDeviceRegistryTable(pool);
  await pool.request()
    .input("device_code", sql.NVarChar(200), normalizedDevice.id)
    .input("device_name", sql.NVarChar(200), normalizedDevice.name || normalizedDevice.id)
    .input("user_ref", sql.NVarChar(120), normalizedDevice.userRef || null)
    .input("group_code", sql.NVarChar(80), normalizedDevice.groupCode || null)
    .input("group_label", sql.NVarChar(200), normalizedDevice.groupLabel || null)
    .input("context_code", sql.NVarChar(100), normalizedDevice.contextCode || "device")
    .input("collect_delivery", sql.NVarChar(120), normalizedDevice.collectDelivery || null)
    .input("channel_code", sql.NVarChar(40), normalizeText(device?.channelCode) || "COLLECT")
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
  const ticket = `assign-${latest.executableId}-${normalizedDevice.id}-${Date.now()}`;
  const insert = await pool.request()
    .input("executable_id", sql.Int, latest.executableId)
    .input("device_ref", sql.NVarChar(200), normalizedDevice.id)
    .input("context_code", sql.NVarChar(100), normalizedDevice.contextCode || "device")
    .query(`
      INSERT INTO ${APP_SCHEMA}.survey_device_assignments
      (
        executable_id,
        device_ref,
        context_code,
        assigned_at,
        expires_at,
        created_at
      )
      OUTPUT inserted.id
      VALUES
      (
        @executable_id,
        @device_ref,
        @context_code,
        SYSUTCDATETIME(),
        NULL,
        SYSUTCDATETIME()
      );
    `);

  return {
    assignmentId: Number(insert.recordset?.[0]?.id || 0),
    executableId: latest.executableId,
    executableCode: latest.executableCode,
    device: normalizedDevice,
    status: "assigned",
    operation: "assign_survey",
    ticket,
    requestedBy: normalizeText(requestContext.actorId) || "survey-admin",
  };
}

function mapAdminTransitionAction(actionCode) {
  const normalized = normalizeText(actionCode).toLowerCase();
  const map = {
    select_target: { stageCode: "selected", channelCode: "mixed" },
    mark_candidate: { stageCode: "candidate", channelCode: "mixed" },
    mark_reviewed: { stageCode: "reviewed", channelCode: "mixed" },
    authorize_device: { stageCode: "authorized_device", channelCode: "device" },
    authorize_web: { stageCode: "authorized_web", channelCode: "web" },
    authorize_tenant: { stageCode: "authorized_tenant", channelCode: "tenant" },
    handoff_publication: { stageCode: "handoff_publication", channelCode: "mixed" },
    begin_publication_mount: { stageCode: "in_publication_mount", channelCode: "mixed" },
    mount_web_executable: { stageCode: "web_executable_mounted", channelCode: "web" },
    mount_device_executable: { stageCode: "collector_executable_mounted", channelCode: "collector" },
    mount_collector_executable: { stageCode: "collector_executable_mounted", channelCode: "collector" },
    mount_tenant_executable: { stageCode: "tenant_executable_mounted", channelCode: "tenant" },
    finalize_review: { stageCode: "preview_review_completed", channelCode: "mixed" },
    visual_review_passed: { stageCode: "visual_review_passed", channelCode: "mixed" },
    approval_granted: { stageCode: "approved_for_distribution", channelCode: "mixed" },
    return_to_control_queue: { stageCode: "returned_to_control_queue", channelCode: "mixed" },
    production_editor_validated: { stageCode: "production_editor_validated", channelCode: "mixed" },
    distribute_web: { stageCode: "distributed_web", channelCode: "web" },
    distribute_device_tenant: { stageCode: "distributed_device_tenant", channelCode: "tenant" },
    load_collector: { stageCode: "loaded_in_collector", channelCode: "collector" },
    control_monitor_started: { stageCode: "control_monitor_started", channelCode: "mixed" },
    control_monitor_closed: { stageCode: "control_monitor_closed", channelCode: "mixed" },
    control_move_historic: { stageCode: "control_moved_historic", channelCode: "mixed" },
    reception_observe_channel: { stageCode: "reception_observed", channelCode: "mixed" },
    reception_authorize_analytics: { stageCode: "reception_authorized_analytics", channelCode: "mixed" },
  };
  return map[normalized] || null;
}

export async function listSurveyAdminTransitionsByDocCrudDorado(docId, limit = 80) {
  const normalizedDocId = Number(docId);
  if (!Number.isFinite(normalizedDocId) || normalizedDocId <= 0) {
    throw new Error("Identificador de encuesta invalido");
  }

  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 80, 200));
  const pool = await getAppPool();
  const docResult = await pool.request()
    .input("doc_id", sql.Int, normalizedDocId)
    .query(`SELECT TOP (1) code FROM ${APP_SCHEMA}.survey_docs WHERE id = @doc_id;`);
  const docCode = String(docResult.recordset?.[0]?.code || "");

  const result = await pool.request()
    .input("doc_id", sql.Int, normalizedDocId)
    .input("top_limit", sql.Int, normalizedLimit)
    .query(`
      SELECT TOP (@top_limit)
        id,
        doc_id,
        executable_id,
        from_status,
        to_status,
        transitioned_by,
        transitioned_at,
        notes,
        created_at
      FROM ${APP_SCHEMA}.survey_admin_transitions
      WHERE doc_id = @doc_id
      ORDER BY transitioned_at DESC, id DESC;
    `);

  return (result.recordset || []).map((row) => {
    const meta = parseTransitionMeta(row.notes);
    return {
      transitionId: Number(row.id || 0),
      docId: Number(row.doc_id || 0),
      executableId: Number(row.executable_id || 0),
      docCode,
      actionCode: String(row.from_status || meta.action || ""),
      stageCode: String(row.to_status || ""),
      channelCode: String(meta.channel || "mixed"),
      transitionStatus: "recorded",
      transitionNote: String(meta.note || row.notes || ""),
      requestedBy: String(row.transitioned_by || ""),
      correlationId: String(meta.corr || ""),
      createdAt: row.transitioned_at ? String(row.transitioned_at) : null,
      updatedAt: row.created_at ? String(row.created_at) : null,
    };
  });
}

export async function registerSurveyAdminTransitionCrudDorado({
  docId,
  executableId,
  actionCode,
  transitionNote,
  requestContext = {},
}) {
  const normalizedDocId = Number(docId);
  if (!Number.isFinite(normalizedDocId) || normalizedDocId <= 0) {
    throw new Error("Identificador de encuesta invalido");
  }

  const actionMeta = mapAdminTransitionAction(actionCode);
  if (!actionMeta) {
    throw new Error("Accion administrativa no soportada");
  }

  const normalizedExecutableId = Number(executableId || 0);
  const resolvedExecutableId =
    Number.isFinite(normalizedExecutableId) && normalizedExecutableId > 0
      ? normalizedExecutableId
      : null;

  const pool = await getAppPool();
  
  // Ensure table exists before inserting
  await ensureSurveyAdminTransitionsTable(pool);

  const docResult = await pool.request()
    .input("doc_id", sql.Int, normalizedDocId)
    .query(`SELECT TOP (1) code FROM ${APP_SCHEMA}.survey_docs WHERE id = @doc_id;`);

  const docCode = String(docResult.recordset?.[0]?.code || "");
  if (!docCode) {
    throw new Error("Encuesta no encontrada para transicion administrativa");
  }

  const note = buildTransitionNote(
    actionCode,
    transitionNote,
    actionMeta.channelCode,
    requestContext.correlationId,
  );

  const insert = await pool.request()
    .input("doc_id", sql.Int, normalizedDocId)
    .input("executable_id", sql.Int, resolvedExecutableId)
    .input("from_status", sql.NVarChar(50), normalizeText(actionCode).toLowerCase())
    .input("to_status", sql.NVarChar(50), actionMeta.stageCode)
    .input("transitioned_by", sql.NVarChar(100), normalizeText(requestContext.actorId) || "survey-admin")
    .input("notes", sql.NVarChar(sql.MAX), note)
    .query(`
      INSERT INTO ${APP_SCHEMA}.survey_admin_transitions
      (
        doc_id,
        executable_id,
        from_status,
        to_status,
        transitioned_by,
        transitioned_at,
        notes,
        created_at
      )
      OUTPUT inserted.id
      VALUES
      (
        @doc_id,
        @executable_id,
        @from_status,
        @to_status,
        @transitioned_by,
        SYSUTCDATETIME(),
        @notes,
        SYSUTCDATETIME()
      );
    `);

  if (
    ["control_monitor_closed", "control_move_historic"].includes(
      normalizeText(actionCode).toLowerCase(),
    )
  ) {
    await pool.request()
      .input("doc_id", sql.Int, normalizedDocId)
      .query(`
        UPDATE ${APP_SCHEMA}.survey_executables
        SET is_active = 0
        WHERE doc_id = @doc_id
          AND is_active = 1;
      `);
  }

  return {
    transitionId: Number(insert.recordset?.[0]?.id || 0),
    docId: normalizedDocId,
    executableId: resolvedExecutableId || 0,
    docCode,
    actionCode: normalizeText(actionCode).toLowerCase(),
    stageCode: actionMeta.stageCode,
    channelCode: actionMeta.channelCode,
    transitionStatus: "recorded",
  };
}

export async function listSurveyAdminQueueCrudDorado(limit = 50) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const pool = await getAppPool();
  await ensureSurveyExecutableChannelColumn(pool);
  const result = await pool.request()
    .input("top_limit", sql.Int, normalizedLimit)
    .query(`
      SELECT TOP (@top_limit)
        e.id AS executable_id,
        e.doc_id,
        e.channel_code,
        d.code AS doc_code,
        d.title AS doc_name,
        e.version_number,
        e.is_active,
        e.published_at,
        (
          SELECT COUNT_BIG(1)
          FROM ${APP_SCHEMA}.survey_device_assignments a
          WHERE a.executable_id = e.id
        ) AS assign_count,
        (
          SELECT COUNT_BIG(1)
          FROM ${APP_SCHEMA}.survey_collect_operations c
          WHERE c.executable_id = e.id
            AND c.operation_type = 'queued_load_collect'
        ) AS collect_queued_count,
        (
          SELECT TOP (1) c.operated_by
          FROM ${APP_SCHEMA}.survey_collect_operations c
          WHERE c.executable_id = e.id
          ORDER BY c.operated_at DESC, c.id DESC
        ) AS last_requested_by
      FROM ${APP_SCHEMA}.survey_executables e
      INNER JOIN ${APP_SCHEMA}.survey_docs d
        ON d.id = e.doc_id
      ORDER BY e.published_at DESC, e.id DESC;
    `);

  return (result.recordset || []).map((row) => {
    const executableId = Number(row.executable_id || 0);
    const docId = Number(row.doc_id || 0);
    const version = Number(row.version_number || 1);
    const assignCount = Number(row.assign_count || 0);
    const collectQueuedCount = Number(row.collect_queued_count || 0);
    const channelCode = normalizeExecutableChannelCode(
      row.channel_code ||
        resolveDistributionChannel({
          assignCount,
          collectQueuedCount,
        }),
    );
    return {
      executableId,
      docId,
      docCode: String(row.doc_code || ""),
      docName: String(row.doc_name || ""),
      channelCode,
      publicationStatus: Number(row.is_active ?? 0) === 1 ? "available" : "retired",
      requestedBy: String(row.last_requested_by || ""),
      createdAt: row.published_at ? String(row.published_at) : null,
      updatedAt: row.published_at ? String(row.published_at) : null,
      executableCode: buildExecutableCode(executableId, docId, version, channelCode, String(row.doc_code || "")),
      assignmentCount: assignCount,
      collectQueuedCount,
    };
  });
}

export async function listSurveyProductionControlCrudDorado(limit = 50) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const pool = await getAppPool();
  await ensureSurveyExecutableChannelColumn(pool);
  const result = await pool.request()
    .input("top_limit", sql.Int, normalizedLimit)
    .query(`
      SELECT TOP (@top_limit)
        e.id AS executable_id,
        e.doc_id,
        e.channel_code,
        d.code AS doc_code,
        d.title AS doc_name,
        e.version_number,
        e.is_active,
        e.published_at,
        (
          SELECT COUNT_BIG(1)
          FROM ${APP_SCHEMA}.survey_device_assignments a
          WHERE a.executable_id = e.id
        ) AS assign_count,
        (
          SELECT COUNT_BIG(1)
          FROM ${APP_SCHEMA}.survey_collect_operations c
          WHERE c.executable_id = e.id
            AND c.operation_type = 'queued_load_collect'
        ) AS collect_queued_count,
        (
          SELECT TOP (1) t.to_status
          FROM ${APP_SCHEMA}.survey_admin_transitions t
          WHERE t.executable_id = e.id
             OR (t.executable_id IS NULL AND t.doc_id = e.doc_id)
          ORDER BY CASE WHEN t.executable_id = e.id THEN 0 ELSE 1 END,
            t.transitioned_at DESC,
            t.id DESC
        ) AS latest_control_state
        ,(
          SELECT TOP (1) t.transitioned_at
          FROM ${APP_SCHEMA}.survey_admin_transitions t
          WHERE t.executable_id = e.id
             OR (t.executable_id IS NULL AND t.doc_id = e.doc_id)
          ORDER BY CASE WHEN t.executable_id = e.id THEN 0 ELSE 1 END,
            t.transitioned_at DESC,
            t.id DESC
        ) AS latest_control_at
      FROM ${APP_SCHEMA}.survey_executables e
      INNER JOIN ${APP_SCHEMA}.survey_docs d
        ON d.id = e.doc_id
      ORDER BY e.published_at DESC, e.id DESC;
    `);

  return (result.recordset || []).map((row) => {
    const executableId = Number(row.executable_id || 0);
    const docId = Number(row.doc_id || 0);
    const version = Number(row.version_number || 1);
    const assignCount = Number(row.assign_count || 0);
    const collectQueuedCount = Number(row.collect_queued_count || 0);
    const channelCode = normalizeExecutableChannelCode(
      row.channel_code ||
        resolveDistributionChannel({
          assignCount,
          collectQueuedCount,
        }),
    );
    return {
      executableId,
      executableCode: buildExecutableCode(
        executableId,
        docId,
        version,
        channelCode,
        String(row.doc_code || ""),
      ),
      docId,
      docCode: String(row.doc_code || ""),
      docName: String(row.doc_name || ""),
      channelCode,
      publicationVersion: version,
      publicationStatus: Number(row.is_active ?? 0) === 1 ? "available" : "retired",
      publishedAt: row.published_at ? String(row.published_at) : null,
      isActive: Number(row.is_active ?? 0) === 1,
      assignmentCount: assignCount,
      collectQueuedCount,
      controlState: String(row.latest_control_state || "pending_control"),
      latestControlAt: row.latest_control_at ? String(row.latest_control_at) : null,
    };
  });
}
