import { getAppPool, sqlType } from "../../db/sql.js";

const sql = sqlType();
const APP_SCHEMA = "core_encuestas";

function normalizeLimit(value, fallback = 50) {
  return Math.max(1, Math.min(Number(value) || fallback, 200));
}

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
  const codeMatch = String(docCode || "").match(/(\d+)$/);
  const docNum = codeMatch ? Number(codeMatch[1]) : Number(docId);
  return `EXE-${channel}-ENC-${String(docNum).padStart(4, "0")}-V${String(version).padStart(2, "0")}-R${String(executableId).padStart(4, "0")}`;
}

function buildAnswerCountExpression(submissionRef = "s.id") {
  return `(
        SELECT COUNT_BIG(1) FROM ${APP_SCHEMA}.survey_answer_likerts al WHERE al.submission_id = ${submissionRef}
      ) + (
        SELECT COUNT_BIG(1) FROM ${APP_SCHEMA}.survey_answer_numerics an WHERE an.submission_id = ${submissionRef}
      ) + (
        SELECT COUNT_BIG(1) FROM ${APP_SCHEMA}.survey_answer_ranges ar WHERE ar.submission_id = ${submissionRef}
      ) + (
        SELECT COUNT_BIG(1) FROM ${APP_SCHEMA}.survey_answer_texts atx WHERE atx.submission_id = ${submissionRef}
      ) + (
        SELECT COUNT_BIG(1) FROM ${APP_SCHEMA}.survey_answer_choices_single acs WHERE acs.submission_id = ${submissionRef}
      ) + (
        SELECT COUNT_BIG(1) FROM ${APP_SCHEMA}.survey_answer_choices_multi acm WHERE acm.submission_id = ${submissionRef}
      )`;
}

function mapReceptionRow(row) {
  const answerCount = Number(row.answer_count || 0);
  const consentGiven = Number(row.consent_given || 0) === 1;
  const normalizedStatus = normalizeText(row.submission_status).toLowerCase();

  let quality = "REVISION";
  if (consentGiven && answerCount > 0) quality = "OK";
  else if (!consentGiven) quality = "CONSENTIMIENTO";
  else if (answerCount === 0) quality = "SIN_RESPUESTAS";

  let status = "En revision";
  if (normalizedStatus === "completed" && consentGiven && answerCount > 0) {
    status = "Listo para SQL";
  } else if (normalizedStatus === "completed") {
    status = "Completo con observaciones";
  } else if (normalizedStatus === "started") {
    status = "En captura";
  }

  return {
    lote: normalizeText(row.submission_token) || `SUB-${row.submission_id}`,
    instrumento: [normalizeText(row.doc_code), normalizeText(row.doc_name)]
      .filter(Boolean)
      .join(" · "),
    origen:
      normalizeText(row.capture_channel) ||
      normalizeText(row.business_context) ||
      "Sin canal",
    respuestas: answerCount,
    calidad: quality,
    status,
    submissionId: Number(row.submission_id || 0),
    executableId: Number(row.executable_id || 0),
    consentGiven,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function mapInventoryRow(row) {
  return {
    tableName: normalizeText(row.table_name),
    purpose: normalizeText(row.purpose),
    rowCount: Number(row.row_count || 0),
    status: "CONNECTED",
  };
}

function mapReceptionByExecutableRow(row) {
  const executableId = Number(row.executable_id || 0);
  const docId = Number(row.doc_id || 0);
  const version = Number(row.version_number || 1);
  const channelCode = normalizeExecutableChannelCode(row.channel_code);
  return {
    executableId,
    docId,
    docCode: normalizeText(row.doc_code),
    docName: normalizeText(row.doc_name),
    channelCode,
    publicationVersion: version,
    executableCode: buildExecutableCode(executableId, docId, version, channelCode, normalizeText(row.doc_code)),
    totalSeries: Number(row.series_count || 0),
    inCaptureCount: Number(row.in_capture_count || 0),
    completedCount: Number(row.completed_count || 0),
    observedCount: Number(row.observed_count || 0),
    firstReceptionAt: row.first_reception_at ? String(row.first_reception_at) : null,
    lastReceptionAt: row.last_reception_at ? String(row.last_reception_at) : null,
    lastCompletedAt: row.last_completed_at ? String(row.last_completed_at) : null,
  };
}

function mapReceptionExecutableLineRow(row) {
  return {
    executableLineId: Number(row.executableline_id || 0),
    lineOrder: Number(row.line_order || 0) || 1,
    sectionType: normalizeText(row.section_type).toLowerCase(),
    questionText: normalizeText(row.question_text),
    responseProfileCode: normalizeText(row.response_profile_code),
    inputType: normalizeText(row.input_type).toLowerCase(),
    selectionMode: normalizeText(row.selection_mode).toLowerCase(),
    minSelections: row.min_selections == null ? null : Number(row.min_selections),
    maxSelections: row.max_selections == null ? null : Number(row.max_selections),
    numericKind: normalizeText(row.numeric_kind).toLowerCase(),
    precisionDigits: row.precision_digits == null ? null : Number(row.precision_digits),
    textKind: normalizeText(row.text_kind).toLowerCase(),
    optionCount: Number(row.option_count || 0),
  };
}

function mapReceptionExecutableResponseRow(row, index = 0) {
  const submissionId = Number(row.submission_id || 0);
  const executableLineId = Number(row.executableline_id || 0);
  const answerKind = normalizeText(row.answer_kind).toLowerCase() || "text";
  const answerValue = normalizeText(row.answer_value);
  const capturedAt = row.captured_at
    ? String(row.captured_at)
    : row.completed_at
      ? String(row.completed_at)
      : row.started_at
        ? String(row.started_at)
        : null;

  return {
    responseId: `${answerKind}-${submissionId}-${executableLineId}-${index + 1}`,
    submissionId,
    seriesId: normalizeText(row.submission_token) || `SUB-${submissionId}`,
    executableLineId,
    lineOrder: Number(row.line_order || 0) || 1,
    sectionType: normalizeText(row.section_type).toLowerCase(),
    questionText: normalizeText(row.question_text),
    responseProfileCode: normalizeText(row.response_profile_code),
    answerKind,
    answerValue,
    capturedAt,
  };
}

export async function getSurveyReceptionOverviewCrudDorado(limit = 50) {
  const normalizedLimit = normalizeLimit(limit, 50);
  const pool = await getAppPool();

  const rowsResult = await pool.request().input("top_limit", sql.Int, normalizedLimit).query(`
    SELECT TOP (@top_limit)
      s.id AS submission_id,
      s.executable_id,
      s.submission_token,
      s.status AS submission_status,
      s.started_at,
      s.completed_at,
      s.capture_channel,
      s.business_context,
      sp.consent_given,
      d.code AS doc_code,
      d.title AS doc_name,
      ${buildAnswerCountExpression("s.id")} AS answer_count
    FROM ${APP_SCHEMA}.survey_submissions s
    LEFT JOIN ${APP_SCHEMA}.survey_submission_profiles sp
      ON sp.submission_id = s.id
    LEFT JOIN ${APP_SCHEMA}.survey_executables e
      ON e.id = s.executable_id
    LEFT JOIN ${APP_SCHEMA}.survey_docs d
      ON d.id = e.doc_id
    ORDER BY COALESCE(s.completed_at, s.started_at, s.created_at) DESC, s.id DESC;
  `);

  const inventoryResult = await pool.request().query(`
    SELECT 'survey_submissions' AS table_name, 'Encabezado de recepcion por ejecucion aplicada' AS purpose, COUNT_BIG(1) AS row_count FROM ${APP_SCHEMA}.survey_submissions
    UNION ALL
    SELECT 'survey_submission_profiles', 'Consentimiento, perfil y metadata de captura' AS purpose, COUNT_BIG(1) AS row_count FROM ${APP_SCHEMA}.survey_submission_profiles
    UNION ALL
    SELECT 'survey_answer_likerts', 'Respuestas ordinales capturadas' AS purpose, COUNT_BIG(1) AS row_count FROM ${APP_SCHEMA}.survey_answer_likerts
    UNION ALL
    SELECT 'survey_answer_numerics', 'Respuestas numericas capturadas' AS purpose, COUNT_BIG(1) AS row_count FROM ${APP_SCHEMA}.survey_answer_numerics
    UNION ALL
    SELECT 'survey_answer_ranges', 'Respuestas de rango capturadas' AS purpose, COUNT_BIG(1) AS row_count FROM ${APP_SCHEMA}.survey_answer_ranges
    UNION ALL
    SELECT 'survey_answer_texts', 'Respuestas abiertas capturadas' AS purpose, COUNT_BIG(1) AS row_count FROM ${APP_SCHEMA}.survey_answer_texts
    UNION ALL
    SELECT 'survey_answer_choices', 'Respuestas de seleccion simple/multiple' AS purpose,
      (
        (SELECT COUNT_BIG(1) FROM ${APP_SCHEMA}.survey_answer_choices_single) +
        (SELECT COUNT_BIG(1) FROM ${APP_SCHEMA}.survey_answer_choices_multi)
      ) AS row_count;
  `);

  return {
    rows: (rowsResult.recordset || []).map(mapReceptionRow),
    inventory: (inventoryResult.recordset || []).map(mapInventoryRow),
  };
}

export async function listSurveyReceptionByExecutableCrudDorado(limit = 50) {
  const normalizedLimit = normalizeLimit(limit, 50);
  const pool = await getAppPool();

  const result = await pool.request().input("top_limit", sql.Int, normalizedLimit).query(`
    SELECT TOP (@top_limit)
      e.id AS executable_id,
      e.doc_id,
      e.channel_code,
      e.version_number,
      d.code AS doc_code,
      d.title AS doc_name,
      COUNT_BIG(s.id) AS series_count,
      SUM(CASE WHEN LOWER(ISNULL(s.status, '')) = 'started' THEN 1 ELSE 0 END) AS in_capture_count,
      SUM(CASE WHEN LOWER(ISNULL(s.status, '')) = 'completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(
        CASE
          WHEN s.id IS NULL THEN 0
          WHEN ISNULL(sp.consent_given, 0) = 0 THEN 1
          WHEN ISNULL(ans.answer_count, 0) = 0 THEN 1
          ELSE 0
        END
      ) AS observed_count,
      MIN(COALESCE(s.started_at, s.created_at)) AS first_reception_at,
      MAX(COALESCE(s.completed_at, s.started_at, s.created_at)) AS last_reception_at,
      MAX(s.completed_at) AS last_completed_at
    FROM ${APP_SCHEMA}.survey_executables e
    INNER JOIN ${APP_SCHEMA}.survey_docs d
      ON d.id = e.doc_id
    LEFT JOIN ${APP_SCHEMA}.survey_submissions s
      ON s.executable_id = e.id
    LEFT JOIN ${APP_SCHEMA}.survey_submission_profiles sp
      ON sp.submission_id = s.id
    OUTER APPLY (
      SELECT ${buildAnswerCountExpression("s.id")} AS answer_count
    ) ans
    GROUP BY
      e.id,
      e.doc_id,
      e.channel_code,
      e.version_number,
      d.code,
      d.title
    ORDER BY MAX(COALESCE(s.completed_at, s.started_at, s.created_at, e.published_at)) DESC, e.id DESC;
  `);

  return (result.recordset || []).map(mapReceptionByExecutableRow);
}

export async function getSurveyReceptionExecutableDetailCrudDorado(executableId) {
  const normalizedExecutableId = Number(executableId || 0);
  if (!Number.isFinite(normalizedExecutableId) || normalizedExecutableId <= 0) {
    return null;
  }

  const pool = await getAppPool();

  const headerResult = await pool.request()
    .input("executable_id", sql.Int, normalizedExecutableId)
    .query(`
      SELECT
        e.id AS executable_id,
        e.doc_id,
        e.channel_code,
        e.version_number,
        e.published_at,
        d.code AS doc_code,
        d.title AS doc_name,
        d.objective,
        d.audience
      FROM ${APP_SCHEMA}.survey_executables e
      INNER JOIN ${APP_SCHEMA}.survey_docs d
        ON d.id = e.doc_id
      WHERE e.id = @executable_id;
    `);

  const header = headerResult.recordset?.[0];
  if (!header) return null;

  const linesResult = await pool.request()
    .input("executable_id", sql.Int, normalizedExecutableId)
    .query(`
      SELECT
        l.id AS executableline_id,
        l.sort_order AS line_order,
        l.question_text,
        COALESCE(NULLIF(p.section_type, ''), NULLIF(l.question_type, ''), 'text') AS section_type,
        p.code AS response_profile_code,
        p.input_type,
        ch.selection_mode,
        ch.min_selections,
        ch.max_selections,
        num.numeric_kind,
        num.precision_digits,
        txt.text_kind,
        COUNT(opt.id) AS option_count
      FROM ${APP_SCHEMA}.survey_executablelines l
      LEFT JOIN ${APP_SCHEMA}.survey_response_profiles p
        ON p.id = l.response_profile_id
      LEFT JOIN ${APP_SCHEMA}.survey_executableline_options opt
        ON opt.executableline_id = l.id
      OUTER APPLY (
        SELECT TOP (1)
          c.selection_mode,
          c.min_selections,
          c.max_selections
        FROM ${APP_SCHEMA}.survey_response_profile_choices c
        WHERE c.profile_id = l.response_profile_id
        ORDER BY c.id DESC
      ) ch
      OUTER APPLY (
        SELECT TOP (1)
          CASE
            WHEN n.numeric_value_decimal IS NOT NULL THEN 'decimal'
            ELSE 'integer'
          END AS numeric_kind,
          CASE
            WHEN n.numeric_value_decimal IS NOT NULL THEN 2
            ELSE 0
          END AS precision_digits
        FROM ${APP_SCHEMA}.survey_response_profile_numerics n
        WHERE n.profile_id = l.response_profile_id
        ORDER BY n.id DESC
      ) num
      OUTER APPLY (
        SELECT TOP (1)
          t.text_kind
        FROM ${APP_SCHEMA}.survey_response_profile_texts t
        WHERE t.profile_id = l.response_profile_id
        ORDER BY t.id DESC
      ) txt
      WHERE l.executable_id = @executable_id
      GROUP BY
        l.id,
        l.sort_order,
        l.question_text,
        p.section_type,
        l.question_type,
        p.code,
        p.input_type,
        ch.selection_mode,
        ch.min_selections,
        ch.max_selections,
        num.numeric_kind,
        num.precision_digits,
        txt.text_kind
      ORDER BY l.sort_order, l.id;
    `);

  const responsesResult = await pool.request()
    .input("executable_id", sql.Int, normalizedExecutableId)
    .query(`
      WITH answer_union AS (
        SELECT
          'likert' AS answer_kind,
          al.submission_id,
          al.executableline_id,
          CAST(al.likert_value AS NVARCHAR(200)) AS answer_value,
          al.created_at AS captured_at
        FROM ${APP_SCHEMA}.survey_answer_likerts al
        INNER JOIN ${APP_SCHEMA}.survey_submissions s
          ON s.id = al.submission_id
        WHERE s.executable_id = @executable_id

        UNION ALL

        SELECT
          'numerico' AS answer_kind,
          an.submission_id,
          an.executableline_id,
          COALESCE(CAST(an.numeric_value_decimal AS NVARCHAR(200)), CAST(an.numeric_value_integer AS NVARCHAR(200))) AS answer_value,
          an.created_at AS captured_at
        FROM ${APP_SCHEMA}.survey_answer_numerics an
        INNER JOIN ${APP_SCHEMA}.survey_submissions s
          ON s.id = an.submission_id
        WHERE s.executable_id = @executable_id

        UNION ALL

        SELECT
          'rango' AS answer_kind,
          ar.submission_id,
          ar.executableline_id,
          CONCAT(
            'min=',
            COALESCE(CAST(ar.range_min_decimal AS NVARCHAR(200)), CAST(ar.range_min_integer AS NVARCHAR(200)), ''),
            ', max=',
            COALESCE(CAST(ar.range_max_decimal AS NVARCHAR(200)), CAST(ar.range_max_integer AS NVARCHAR(200)), '')
          ) AS answer_value,
          ar.created_at AS captured_at
        FROM ${APP_SCHEMA}.survey_answer_ranges ar
        INNER JOIN ${APP_SCHEMA}.survey_submissions s
          ON s.id = ar.submission_id
        WHERE s.executable_id = @executable_id

        UNION ALL

        SELECT
          'single_choice' AS answer_kind,
          acs.submission_id,
          acs.executableline_id,
          CAST(acs.choice_value AS NVARCHAR(200)) AS answer_value,
          acs.created_at AS captured_at
        FROM ${APP_SCHEMA}.survey_answer_choices_single acs
        INNER JOIN ${APP_SCHEMA}.survey_submissions s
          ON s.id = acs.submission_id
        WHERE s.executable_id = @executable_id

        UNION ALL

        SELECT
          'multi_choice' AS answer_kind,
          acm.submission_id,
          acm.executableline_id,
          CAST(acm.choice_value AS NVARCHAR(200)) AS answer_value,
          acm.created_at AS captured_at
        FROM ${APP_SCHEMA}.survey_answer_choices_multi acm
        INNER JOIN ${APP_SCHEMA}.survey_submissions s
          ON s.id = acm.submission_id
        WHERE s.executable_id = @executable_id

        UNION ALL

        SELECT
          'text' AS answer_kind,
          atx.submission_id,
          atx.executableline_id,
          CAST(atx.text_value AS NVARCHAR(MAX)) AS answer_value,
          atx.created_at AS captured_at
        FROM ${APP_SCHEMA}.survey_answer_texts atx
        INNER JOIN ${APP_SCHEMA}.survey_submissions s
          ON s.id = atx.submission_id
        WHERE s.executable_id = @executable_id
      )
      SELECT
        au.answer_kind,
        au.submission_id,
        s.submission_token,
        s.status AS submission_status,
        s.started_at,
        s.completed_at,
        au.executableline_id,
        l.sort_order AS line_order,
        l.question_text,
        COALESCE(NULLIF(p.section_type, ''), NULLIF(l.question_type, ''), au.answer_kind) AS section_type,
        p.code AS response_profile_code,
        au.answer_value,
        au.captured_at
      FROM answer_union au
      INNER JOIN ${APP_SCHEMA}.survey_submissions s
        ON s.id = au.submission_id
      INNER JOIN ${APP_SCHEMA}.survey_executablelines l
        ON l.id = au.executableline_id
      LEFT JOIN ${APP_SCHEMA}.survey_response_profiles p
        ON p.id = l.response_profile_id
      ORDER BY
        COALESCE(s.completed_at, s.started_at, au.captured_at) DESC,
        s.id DESC,
        l.sort_order,
        au.answer_kind,
        au.answer_value;
    `);

  const lineRows = (linesResult.recordset || []).map(mapReceptionExecutableLineRow);
  const responseRows = (responsesResult.recordset || []).map(mapReceptionExecutableResponseRow);

  const lineIndex = new Map(
    lineRows.map((row) => [row.executableLineId, {
      ...row,
      seriesSet: new Set(),
      responseCount: 0,
    }]),
  );

  responseRows.forEach((row) => {
    const line = lineIndex.get(row.executableLineId);
    if (!line) return;
    line.responseCount += 1;
    line.seriesSet.add(row.submissionId);
  });

  const reactivos = Array.from(lineIndex.values()).map((row) => ({
    executableLineId: row.executableLineId,
    lineOrder: row.lineOrder,
    sectionType: row.sectionType,
    questionText: row.questionText,
    responseProfileCode: row.responseProfileCode,
    inputType: row.inputType,
    selectionMode: row.selectionMode,
    minSelections: row.minSelections,
    maxSelections: row.maxSelections,
    numericKind: row.numericKind,
    precisionDigits: row.precisionDigits,
    textKind: row.textKind,
    optionCount: row.optionCount,
    seriesCount: row.seriesSet.size,
    responseCount: row.responseCount,
  }));

  return {
    executableId: normalizedExecutableId,
    docId: Number(header.doc_id || 0),
    docCode: normalizeText(header.doc_code),
    docName: normalizeText(header.doc_name),
    objective: normalizeText(header.objective),
    audience: normalizeText(header.audience),
    channelCode: normalizeExecutableChannelCode(header.channel_code),
    publicationVersion: Number(header.version_number || 1),
    publishedAt: header.published_at ? String(header.published_at) : null,
    executableCode: buildExecutableCode(
      normalizedExecutableId,
      Number(header.doc_id || 0),
      Number(header.version_number || 1),
      header.channel_code,
      header.doc_code,
    ),
    reactiveCount: reactivos.length,
    responseCount: responseRows.length,
    reactivos,
    responses: responseRows,
  };
}