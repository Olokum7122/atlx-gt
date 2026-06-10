import { getAppPool, sqlType } from "../../db/sql.js";

const sql = sqlType();
const APP_SCHEMA = "core_encuestas";

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

function executableUuidFromId(serverId) {
  return `exe-${String(serverId || "0")}`;
}

function lineUuidFromId(serverId) {
  return `line-${String(serverId || "0")}`;
}

function optionUuidFromId(serverId) {
  return `opt-${String(serverId || "0")}`;
}

function bucketUuidFromId(serverId) {
  return `bucket-${String(serverId || "0")}`;
}

function normalizeIsoDate(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseServerId(value, kind = "") {
  if (Number.isFinite(Number(value)) && Number(value) > 0) {
    return Number(value);
  }

  const normalized = normalizeText(value);
  if (!normalized) return 0;

  if (kind === "executable") {
    const codeMatch = normalized.match(/-R(\d+)$/i);
    if (codeMatch) return Number(codeMatch[1]);
  }

  const genericMatch = normalized.match(/(\d+)$/);
  return genericMatch ? Number(genericMatch[1]) : 0;
}

function normalizeCaptureChannel(payload, deviceId) {
  const source = normalizeText(payload?.captureChannel);
  if (source) return normalizeExecutableChannelCode(source);
  return normalizeText(deviceId) ? "collector" : "web";
}

function resolveProfileTypeCode(payload) {
  const normalized = normalizeText(payload?.profileTypeCode);
  return normalized || "CLIENTE_FINAL";
}

function resolveConsentTextVersion(payload) {
  const normalized = normalizeText(payload?.consentTextVersion);
  return normalized || "GT-CONSENT-V1";
}

function resolveSubmissionToken(payload) {
  const normalized =
    normalizeText(payload?.submissionUuid) ||
    normalizeText(payload?.submissionToken) ||
    `sub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return normalized.slice(0, 200);
}

function inferAnswerKind(line) {
  const sectionType = normalizeText(line?.sectionType).toLowerCase();
  const inputType = normalizeText(line?.inputType).toLowerCase();

  if (sectionType === "likert") return "likert";
  if (sectionType === "unica") return "choice_single";
  if (
    sectionType === "multi" ||
    inputType.includes("choice") ||
    normalizeText(line?.selectionMode)
  ) {
    return "choice_multi";
  }
  if (sectionType === "rango") return "rango";
  if (
    sectionType === "numerico" ||
    inputType.includes("numeric") ||
    inputType.includes("decimal") ||
    inputType.includes("integer")
  ) {
    return "numeric";
  }
  return "text";
}

async function loadExecutableDefinition(transaction, executableId) {
  const lineResult = await new sql.Request(transaction).input("executable_id", sql.Int, executableId).query(`
    SELECT
      l.id AS executableline_id,
      l.question_type,
      p.input_type,
      p.section_type AS profile_section_type,
      ch.selection_mode,
      ch.min_selections,
      ch.max_selections,
      num.numeric_kind,
      num.min_value,
      num.max_value,
      num.precision_digits,
      txt.text_kind,
      txt.min_length AS min_chars,
      txt.max_length AS max_chars
    FROM ${APP_SCHEMA}.survey_executablelines l
    LEFT JOIN ${APP_SCHEMA}.survey_response_profiles p
      ON p.id = l.response_profile_id
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
        CAST(NULL AS DECIMAL(18, 6)) AS min_value,
        CAST(NULL AS DECIMAL(18, 6)) AS max_value,
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
        CASE
          WHEN r.range_min_decimal IS NOT NULL OR r.range_max_decimal IS NOT NULL THEN 2
          ELSE 0
        END AS range_decimal_places,
        COALESCE(CAST(r.range_min_decimal AS DECIMAL(18, 6)), CAST(r.range_min_integer AS DECIMAL(18, 6))) AS range_min_min,
        CAST(NULL AS DECIMAL(18, 6)) AS range_min_max,
        CAST(NULL AS DECIMAL(18, 6)) AS range_max_min,
        COALESCE(CAST(r.range_max_decimal AS DECIMAL(18, 6)), CAST(r.range_max_integer AS DECIMAL(18, 6))) AS range_max_max
      FROM ${APP_SCHEMA}.survey_response_profile_ranges r
      WHERE r.profile_id = l.response_profile_id
      ORDER BY r.id DESC
    ) rng
    OUTER APPLY (
      SELECT TOP (1)
        t.text_kind,
        t.min_length,
        t.max_length
      FROM ${APP_SCHEMA}.survey_response_profile_texts t
      WHERE t.profile_id = l.response_profile_id
      ORDER BY t.id DESC
    ) txt
    WHERE l.executable_id = @executable_id;
  `);

  const optionResult = await new sql.Request(transaction).input("executable_id", sql.Int, executableId).query(`
    SELECT
      o.executableline_id,
      o.option_value,
      o.option_label,
      o.sort_order
    FROM ${APP_SCHEMA}.survey_executableline_options o
    INNER JOIN ${APP_SCHEMA}.survey_executablelines l
      ON l.id = o.executableline_id
    WHERE l.executable_id = @executable_id
    ORDER BY o.executableline_id, o.sort_order, o.id;
  `);

  const optionsByLineId = new Map();
  for (const row of optionResult.recordset || []) {
    const lineId = Number(row.executableline_id || 0);
    if (!optionsByLineId.has(lineId)) optionsByLineId.set(lineId, []);
    optionsByLineId.get(lineId).push({
      optionValue: normalizeText(row.option_value),
      optionLabel: normalizeText(row.option_label),
      optionOrder: Number(row.sort_order || 0) || 1,
    });
  }

  const lines = new Map();
  for (const row of lineResult.recordset || []) {
    const lineId = Number(row.executableline_id || 0);
    lines.set(lineId, {
      lineId,
      sectionType: normalizeText(row.profile_section_type || row.question_type).toLowerCase(),
      inputType: normalizeText(row.input_type).toLowerCase(),
      selectionMode: normalizeText(row.selection_mode).toLowerCase(),
      minSelections: row.min_selections == null ? null : Number(row.min_selections),
      maxSelections: row.max_selections == null ? null : Number(row.max_selections),
      minValue: row.min_value == null ? null : Number(row.min_value),
      maxValue: row.max_value == null ? null : Number(row.max_value),
      precisionDigits: row.precision_digits == null ? null : Number(row.precision_digits),
      rangeDecimalPlaces: row.range_decimal_places == null ? null : Number(row.range_decimal_places),
      rangeMinMin: row.range_min_min == null ? null : Number(row.range_min_min),
      rangeMinMax: row.range_min_max == null ? null : Number(row.range_min_max),
      rangeMaxMin: row.range_max_min == null ? null : Number(row.range_max_min),
      rangeMaxMax: row.range_max_max == null ? null : Number(row.range_max_max),
      textKind: normalizeText(row.text_kind).toLowerCase(),
      minChars: row.min_chars == null ? null : Number(row.min_chars),
      maxChars: row.max_chars == null ? null : Number(row.max_chars),
      options: optionsByLineId.get(lineId) || [],
    });
  }

  return lines;
}

function normalizeSubmissionAnswers(submission, lineDefinitions) {
  const rawAnswers = submission && typeof submission.answers === "object" ? submission.answers : {};
  const normalized = {
    likert: [],
    choiceSingle: [],
    choiceMulti: [],
    numeric: [],
    rango: [],
    text: [],
  };

  for (const [lineId, line] of lineDefinitions.entries()) {
    const answerKind = inferAnswerKind(line);
    const candidates = [
      `line-${lineId}`,
      String(lineId),
      `q_${lineId}`,
    ];

    let rawValue;
    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(rawAnswers, candidate)) {
        rawValue = rawAnswers[candidate];
        break;
      }
    }

    // "rango" se captura como q_X_min y q_X_max; no depende de un valor q_X directo.
    if (answerKind !== "rango" && rawValue == null) continue;

    if (answerKind === "likert") {
      const directValue = Array.isArray(rawValue) ? rawValue[0] : rawValue;
      const numericValue = Number(directValue);
      if (Number.isFinite(numericValue)) {
        normalized.likert.push({ executablelineId: lineId, likertValue: numericValue });
        continue;
      }

      const rawText = normalizeText(directValue).toLowerCase();
      const matchedOption = (line.options || []).find(
        (option) =>
          normalizeText(option.optionValue).toLowerCase() === rawText ||
          normalizeText(option.optionLabel).toLowerCase() === rawText,
      );
      if (matchedOption) {
        normalized.likert.push({
          executablelineId: lineId,
          likertValue: Number(matchedOption.optionOrder || 0) || 1,
        });
      }
      continue;
    }

    if (answerKind === "choice_single") {
      const singleValue = normalizeText(Array.isArray(rawValue) ? rawValue[0] : rawValue);
      if (!singleValue) continue;
      const matchedOption = (line.options || []).find(
        (option) =>
          normalizeText(option.optionValue) === singleValue ||
          normalizeText(option.optionLabel) === singleValue,
      );
      normalized.choiceSingle.push({
        executablelineId: lineId,
        choiceValue: normalizeText(matchedOption?.optionValue) || singleValue,
      });
      continue;
    }

    if (answerKind === "choice_multi") {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        const choiceValue = normalizeText(value);
        if (!choiceValue) continue;
        const matchedOption = (line.options || []).find(
          (option) =>
            normalizeText(option.optionValue) === choiceValue ||
            normalizeText(option.optionLabel) === choiceValue,
        );
        normalized.choiceMulti.push({
          executablelineId: lineId,
          choiceValue: normalizeText(matchedOption?.optionValue) || choiceValue,
        });
      }
      continue;
    }

    if (answerKind === "rango") {
      // El form envía q_X_min y q_X_max como claves separadas en rawAnswers
      const minKey = `q_${lineId}_min`;
      const maxKey = `q_${lineId}_max`;
      const rawMin = rawAnswers[minKey] ?? rawAnswers[`line-${lineId}_min`];
      const rawMax = rawAnswers[maxKey] ?? rawAnswers[`line-${lineId}_max`];
      const useDecimals = (line.rangeDecimalPlaces ?? 0) > 0;
      if (useDecimals) {
        const minDec = rawMin != null ? Number(rawMin) : null;
        const maxDec = rawMax != null ? Number(rawMax) : null;
        if (minDec !== null && !Number.isFinite(minDec)) continue;
        if (maxDec !== null && !Number.isFinite(maxDec)) continue;
        normalized.rango.push({
          executablelineId: lineId,
          rangeMinInteger: null, rangeMinDecimal: minDec,
          rangeMaxInteger: null, rangeMaxDecimal: maxDec,
        });
      } else {
        const minInt = rawMin != null ? Math.trunc(Number(rawMin)) : null;
        const maxInt = rawMax != null ? Math.trunc(Number(rawMax)) : null;
        if (minInt !== null && !Number.isFinite(minInt)) continue;
        if (maxInt !== null && !Number.isFinite(maxInt)) continue;
        normalized.rango.push({
          executablelineId: lineId,
          rangeMinInteger: minInt, rangeMinDecimal: null,
          rangeMaxInteger: maxInt, rangeMaxDecimal: null,
        });
      }
      continue;
    }

    if (answerKind === "numeric") {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        const useDecimals = (line.precisionDigits ?? 0) > 0;
        if (useDecimals) {
          const numericDecimal = Number(value);
          if (!Number.isFinite(numericDecimal)) continue;
          normalized.numeric.push({ executablelineId: lineId, numericInteger: null, numericDecimal: numericDecimal });
        } else {
          const numericInteger = Math.trunc(Number(value));
          if (!Number.isFinite(numericInteger)) continue;
          normalized.numeric.push({ executablelineId: lineId, numericInteger: numericInteger, numericDecimal: null });
        }
      }
      continue;
    }

    const textValue = normalizeText(Array.isArray(rawValue) ? rawValue[0] : rawValue);
    if (textValue) {
      normalized.text.push({ executablelineId: lineId, textValue });
    }
  }

  return normalized;
}

export async function pullAssignedSurveysCrudDorado(deviceId) {
  const normalizedDeviceId = normalizeText(deviceId);
  if (!normalizedDeviceId) return [];

  const pool = await getAppPool();

  const executableResult = await pool
    .request()
    .input("device_ref", sql.NVarChar(200), normalizedDeviceId)
    .query(`
      SELECT DISTINCT
        e.id AS executable_id,
        e.doc_id,
        e.version_number,
        e.is_active,
        e.published_at,
        d.code AS doc_code,
        d.title AS doc_name,
        d.objective,
        d.audience
      FROM (
        SELECT a.executable_id
        FROM ${APP_SCHEMA}.survey_device_assignments a
        WHERE a.device_ref = @device_ref

        UNION

        SELECT o.executable_id
        FROM ${APP_SCHEMA}.survey_collect_operations o
        WHERE o.operation_type = 'queued_load_collect'
          AND o.notes LIKE ('%device=' + @device_ref + '|%')
      ) src
      INNER JOIN ${APP_SCHEMA}.survey_device_registry r
        ON r.device_code = @device_ref
       AND r.channel_code = 'COLLECT'
       AND r.is_active = 1
      INNER JOIN ${APP_SCHEMA}.survey_executables e
        ON e.id = src.executable_id
      LEFT JOIN ${APP_SCHEMA}.survey_docs d
        ON d.id = e.doc_id
      ORDER BY e.id DESC;
    `);

  const executables = executableResult.recordset || [];
  if (!executables.length) return [];

  const executableIds = executables.map((row) => Number(row.executable_id || 0)).filter(Boolean);

  const lineResult = await pool
    .request()
    .query(`
      SELECT
        l.id AS executableline_id,
        l.executable_id,
        l.question_text,
        l.question_type,
        l.sort_order,
        l.response_profile_id,
        p.code AS response_profile_code,
        p.input_type,
        p.section_type AS profile_section_type,
        ch.selection_mode,
        ch.min_selections,
        ch.max_selections,
        num.numeric_kind,
        num.min_value,
        num.max_value,
        num.precision_digits,
        txt.text_kind,
        txt.min_chars,
        txt.max_chars
      FROM ${APP_SCHEMA}.survey_executablelines l
      LEFT JOIN ${APP_SCHEMA}.survey_response_profiles p
        ON p.id = l.response_profile_id
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
            CAST(NULL AS DECIMAL(18, 6)) AS min_value,
            CAST(NULL AS DECIMAL(18, 6)) AS max_value,
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
          t.text_kind,
          t.min_length AS min_chars,
          t.max_length AS max_chars
        FROM ${APP_SCHEMA}.survey_response_profile_texts t
        WHERE t.profile_id = l.response_profile_id
        ORDER BY t.id DESC
      ) txt
      WHERE l.executable_id IN (${executableIds.join(",")})
      ORDER BY l.executable_id, l.sort_order, l.id;
    `);

  const optionResult = await pool
    .request()
    .query(`
      SELECT
        o.id AS executableline_option_id,
        o.executableline_id,
        o.option_value,
        o.option_label,
        o.sort_order
      FROM ${APP_SCHEMA}.survey_executableline_options o
      INNER JOIN ${APP_SCHEMA}.survey_executablelines l
        ON l.id = o.executableline_id
      WHERE l.executable_id IN (${executableIds.join(",")})
      ORDER BY o.executableline_id, o.sort_order, o.id;
    `);

  const bucketResult = await pool
    .request()
    .query(`
      SELECT
        b.id AS executableline_numeric_bucket_id,
        b.executableline_id,
        b.bucket_min,
        b.bucket_max,
        b.bucket_label,
        b.sort_order
      FROM ${APP_SCHEMA}.survey_executableline_numeric_buckets b
      INNER JOIN ${APP_SCHEMA}.survey_executablelines l
        ON l.id = b.executableline_id
      WHERE l.executable_id IN (${executableIds.join(",")})
      ORDER BY b.executableline_id, b.sort_order, b.id;
    `);

  const lines = lineResult.recordset || [];
  const options = optionResult.recordset || [];
  const buckets = bucketResult.recordset || [];

  const optionsByLineId = new Map();
  for (const row of options) {
    const key = Number(row.executableline_id || 0);
    if (!optionsByLineId.has(key)) optionsByLineId.set(key, []);
    optionsByLineId.get(key).push({
      optionUuid: optionUuidFromId(row.executableline_option_id),
      serverExecutablelineOptionId: Number(row.executableline_option_id || 0),
      optionCode: normalizeText(row.option_value) || `OPT-${row.executableline_option_id}`,
      optionLabel: normalizeText(row.option_label),
      optionOrder: Number(row.sort_order || 0) || 1,
      optionScore: null,
      isActive: 1,
    });
  }

  const bucketsByLineId = new Map();
  for (const row of buckets) {
    const key = Number(row.executableline_id || 0);
    if (!bucketsByLineId.has(key)) bucketsByLineId.set(key, []);
    bucketsByLineId.get(key).push({
      bucketUuid: bucketUuidFromId(row.executableline_numeric_bucket_id),
      serverExecutablelineNumericBucketId: Number(row.executableline_numeric_bucket_id || 0),
      bucketOrder: Number(row.sort_order || 0) || 1,
      bucketLabel: normalizeText(row.bucket_label),
      rangeMin: row.bucket_min == null ? null : Number(row.bucket_min),
      rangeMax: row.bucket_max == null ? null : Number(row.bucket_max),
      minInclusive: 1,
      maxInclusive: 1,
      bucketKind: "range",
      isActive: 1,
    });
  }

  const linesByExecutableId = new Map();
  for (const row of lines) {
    const executableId = Number(row.executable_id || 0);
    if (!linesByExecutableId.has(executableId)) linesByExecutableId.set(executableId, []);

    const lineId = Number(row.executableline_id || 0);
    linesByExecutableId.get(executableId).push({
      executablelineUuid: lineUuidFromId(lineId),
      serverExecutablelineId: lineId,
      lineOrder: Number(row.sort_order || 0) || 1,
      sectionType: normalizeText(row.profile_section_type || row.question_type).toLowerCase() || "multi",
      questionText: normalizeText(row.question_text),
      responseProfileCode: normalizeText(row.response_profile_code) || `RP-${lineId}`,
      inputType: normalizeText(row.input_type) || null,
      selectionMode: normalizeText(row.selection_mode) || null,
      minSelections: row.min_selections == null ? null : Number(row.min_selections),
      maxSelections: row.max_selections == null ? null : Number(row.max_selections),
      numericKind: normalizeText(row.numeric_kind) || null,
      minValue: row.min_value == null ? null : Number(row.min_value),
      maxValue: row.max_value == null ? null : Number(row.max_value),
      precisionDigits: row.precision_digits == null ? null : Number(row.precision_digits),
      textKind: normalizeText(row.text_kind) || null,
      minChars: row.min_chars == null ? null : Number(row.min_chars),
      maxChars: row.max_chars == null ? null : Number(row.max_chars),
      isActive: 1,
      options: optionsByLineId.get(lineId) || [],
      numericBuckets: bucketsByLineId.get(lineId) || [],
    });
  }

  return executables.map((row) => {
    const executableId = Number(row.executable_id || 0);
    const lineRows = linesByExecutableId.get(executableId) || [];

    return {
      executableUuid: executableUuidFromId(executableId),
      serverExecutableId: executableId,
      executableCode: `EXE-ENC-${String(row.doc_id || 0).padStart(4, "0")}-V${String(row.version_number || 1).padStart(2, "0")}`,
      docCode: normalizeText(row.doc_code) || `DOC-${row.doc_id}`,
      docName: normalizeText(row.doc_name) || `Encuesta ${row.doc_id}`,
      objective: normalizeText(row.objective),
      audience: normalizeText(row.audience),
      publicationStatus: Number(row.is_active ?? 1) === 1 ? "available" : "retired",
      publicationVersion: Number(row.version_number || 1),
      runtimeStatus: "RECIBIDO_GUARDADO",
      receivedAt: new Date().toISOString(),
      publishedAt: row.published_at ? String(row.published_at) : null,
      retiredAt: null,
      isActive: Number(row.is_active ?? 1) === 1 ? 1 : 0,
      payloadHash: null,
      lines: lineRows,
    };
  });
}

export async function pushSubmissionCrudDorado({ deviceId, submission }) {
  const pool = await getAppPool();
  const transaction = new sql.Transaction(pool);

  const normalizedSubmission = submission && typeof submission === "object" ? submission : {};
  const submissionToken = resolveSubmissionToken(normalizedSubmission);
  const captureChannel = normalizeCaptureChannel(normalizedSubmission, deviceId);
  const executableId = parseServerId(
    normalizedSubmission.surveyExecutableId ||
      normalizedSubmission.surveyExecutableCode ||
      normalizedSubmission.executableId,
    "executable",
  );

  if (!executableId) {
    throw new Error("submission_executable_missing");
  }

  await transaction.begin();

  try {
    const existingResult = await new sql.Request(transaction)
      .input("submission_token", sql.NVarChar(200), submissionToken)
      .query(`
        SELECT TOP (1) id
        FROM ${APP_SCHEMA}.survey_submissions
        WHERE submission_token = @submission_token
        ORDER BY id DESC;
      `);

    const existingSubmissionId = Number(existingResult.recordset?.[0]?.id || 0);
    if (existingSubmissionId) {
      await transaction.commit();
      return {
        ack: true,
        deviceId: normalizeText(deviceId),
        submissionUuid: submissionToken,
        serverSubmissionId: existingSubmissionId,
        receivedAt: new Date().toISOString(),
        duplicated: true,
      };
    }

    const executableResult = await new sql.Request(transaction)
      .input("executable_id", sql.Int, executableId)
      .query(`
        SELECT TOP (1)
          id,
          channel_code,
          doc_id
        FROM ${APP_SCHEMA}.survey_executables
        WHERE id = @executable_id;
      `);

    if (!executableResult.recordset?.length) {
      throw new Error("submission_executable_not_found");
    }

    const lineDefinitions = await loadExecutableDefinition(transaction, executableId);
    if (!lineDefinitions.size) {
      throw new Error("submission_executable_lines_missing");
    }

    const normalizedAnswers = normalizeSubmissionAnswers(normalizedSubmission, lineDefinitions);
    const answerCount =
      normalizedAnswers.likert.length +
      normalizedAnswers.choiceSingle.length +
      normalizedAnswers.choiceMulti.length +
      normalizedAnswers.numeric.length +
      normalizedAnswers.rango.length +
      normalizedAnswers.text.length;

    if (!answerCount) {
      throw new Error("submission_answers_missing");
    }

    const startedAt =
      normalizeIsoDate(normalizedSubmission.startedAt) ||
      normalizeIsoDate(normalizedSubmission.consentAt) ||
      normalizeIsoDate(normalizedSubmission.finalizedAt) ||
      new Date().toISOString();
    const completedAt =
      normalizeIsoDate(normalizedSubmission.finalizedAt) ||
      normalizeIsoDate(normalizedSubmission.consentAt) ||
      startedAt;
    const consentAt = normalizeIsoDate(normalizedSubmission.consentAt) || completedAt;
    const now = new Date().toISOString();
    const consentGiven = Boolean(normalizedSubmission.consentGiven);
    const profilePayload = {
      profileTypeCode: resolveProfileTypeCode(normalizedSubmission),
      respondentRef: normalizeText(normalizedSubmission.respondentRef) || null,
      respondentName: normalizeText(normalizedSubmission.respondentName) || null,
      businessName: normalizeText(normalizedSubmission.businessName) || null,
      captureChannel,
      evidence: normalizedSubmission.evidence || {},
    };

    const submissionInsert = await new sql.Request(transaction)
      .input("executable_id", sql.Int, executableId)
      .input("respondent_ref", sql.NVarChar(200), profilePayload.respondentRef)
      .input("submission_token", sql.NVarChar(200), submissionToken)
      .input("status", sql.NVarChar(40), completedAt ? "completed" : "started")
      .input("started_at", sql.DateTime2, startedAt)
      .input("completed_at", sql.DateTime2, completedAt)
      .input("created_at", sql.DateTime2, now)
      .input("capture_channel", sql.NVarChar(40), captureChannel)
      .input("business_context", sql.NVarChar(160), captureChannel === "web" ? "public_web" : null)
      .input("consent_mode", sql.NVarChar(60), consentGiven ? "explicit" : "not_granted")
      .input("collector_device_ref", sql.NVarChar(200), normalizeText(deviceId) || null)
      .input("profile_opened_at", sql.DateTime2, startedAt)
      .input("profile_completed_at", sql.DateTime2, completedAt)
      .input("profile_payload_json", sql.NVarChar(sql.MAX), JSON.stringify(profilePayload))
      .query(`
        INSERT INTO ${APP_SCHEMA}.survey_submissions
        (
          executable_id,
          respondent_ref,
          submission_token,
          status,
          started_at,
          completed_at,
          created_at,
          capture_channel,
          business_context,
          consent_mode,
          collector_device_ref,
          profile_opened_at,
          profile_completed_at,
          profile_payload_json
        )
        OUTPUT inserted.id
        VALUES
        (
          @executable_id,
          @respondent_ref,
          @submission_token,
          @status,
          @started_at,
          @completed_at,
          @created_at,
          @capture_channel,
          @business_context,
          @consent_mode,
          @collector_device_ref,
          @profile_opened_at,
          @profile_completed_at,
          @profile_payload_json
        );
      `);

    const serverSubmissionId = Number(submissionInsert.recordset?.[0]?.id || 0);
    if (!serverSubmissionId) {
      throw new Error("submission_insert_failed");
    }

    await new sql.Request(transaction)
      .input("submission_id", sql.Int, serverSubmissionId)
      .input("profile_type_code", sql.NVarChar(60), resolveProfileTypeCode(normalizedSubmission))
      .input("respondent_ref", sql.NVarChar(200), profilePayload.respondentRef)
      .input("respondent_name", sql.NVarChar(200), profilePayload.respondentName)
      .input("business_name", sql.NVarChar(200), profilePayload.businessName)
      .input("tenant_owner_ref", sql.NVarChar(200), null)
      .input("consent_given", sql.Bit, consentGiven)
      .input("consent_text_version", sql.NVarChar(60), resolveConsentTextVersion(normalizedSubmission))
      .input("consent_at", sql.DateTime2, consentAt)
      .input("photo_evidence_ref", sql.NVarChar(200), normalizeText(normalizedSubmission?.evidence?.photoUri) || null)
      .input("gps_lat", sql.Decimal(18, 8), normalizedSubmission?.evidence?.geoLat ?? null)
      .input("gps_lng", sql.Decimal(18, 8), normalizedSubmission?.evidence?.geoLng ?? null)
      .input("gps_accuracy_m", sql.Decimal(18, 4), normalizedSubmission?.evidence?.geoAccuracy ?? null)
      .input("capture_channel", sql.NVarChar(40), captureChannel)
      .input("profile_payload_json", sql.NVarChar(sql.MAX), JSON.stringify(profilePayload))
      .input("created_at", sql.DateTime2, now)
      .input("updated_at", sql.DateTime2, now)
      .query(`
        INSERT INTO ${APP_SCHEMA}.survey_submission_profiles
        (
          submission_id,
          profile_type_code,
          respondent_ref,
          respondent_name,
          business_name,
          tenant_owner_ref,
          consent_given,
          consent_text_version,
          consent_at,
          photo_evidence_ref,
          gps_lat,
          gps_lng,
          gps_accuracy_m,
          capture_channel,
          profile_payload_json,
          created_at,
          updated_at
        )
        VALUES
        (
          @submission_id,
          @profile_type_code,
          @respondent_ref,
          @respondent_name,
          @business_name,
          @tenant_owner_ref,
          @consent_given,
          @consent_text_version,
          @consent_at,
          @photo_evidence_ref,
          @gps_lat,
          @gps_lng,
          @gps_accuracy_m,
          @capture_channel,
          @profile_payload_json,
          @created_at,
          @updated_at
        );
      `);

    for (const row of normalizedAnswers.likert) {
      await new sql.Request(transaction)
        .input("submission_id", sql.Int, serverSubmissionId)
        .input("executableline_id", sql.Int, row.executablelineId)
        .input("likert_value", sql.Int, row.likertValue)
        .input("created_at", sql.DateTime2, now)
        .query(`
          INSERT INTO ${APP_SCHEMA}.survey_answer_likerts
          (
            submission_id,
            executableline_id,
            likert_value,
            created_at
          )
          VALUES
          (
            @submission_id,
            @executableline_id,
            @likert_value,
            @created_at
          );
        `);
    }

    for (const row of normalizedAnswers.choiceSingle) {
      await new sql.Request(transaction)
        .input("submission_id", sql.Int, serverSubmissionId)
        .input("executableline_id", sql.Int, row.executablelineId)
        .input("choice_value", sql.NVarChar(200), row.choiceValue)
        .input("created_at", sql.DateTime2, now)
        .query(`
          INSERT INTO ${APP_SCHEMA}.survey_answer_choices_single
          (
            submission_id,
            executableline_id,
            choice_value,
            created_at
          )
          VALUES
          (
            @submission_id,
            @executableline_id,
            @choice_value,
            @created_at
          );
        `);
    }

    for (const row of normalizedAnswers.choiceMulti) {
      await new sql.Request(transaction)
        .input("submission_id", sql.Int, serverSubmissionId)
        .input("executableline_id", sql.Int, row.executablelineId)
        .input("choice_value", sql.NVarChar(200), row.choiceValue)
        .input("created_at", sql.DateTime2, now)
        .query(`
          INSERT INTO ${APP_SCHEMA}.survey_answer_choices_multi
          (
            submission_id,
            executableline_id,
            choice_value,
            created_at
          )
          VALUES
          (
            @submission_id,
            @executableline_id,
            @choice_value,
            @created_at
          );
        `);
    }

    for (const row of normalizedAnswers.numeric) {
      await new sql.Request(transaction)
        .input("submission_id", sql.Int, serverSubmissionId)
        .input("executableline_id", sql.Int, row.executablelineId)
        .input("numeric_value_integer", sql.Int, row.numericInteger)
        .input("numeric_value_decimal", sql.Decimal(18, 6), row.numericDecimal)
        .input("created_at", sql.DateTime2, now)
        .query(`
          INSERT INTO ${APP_SCHEMA}.survey_answer_numerics
          (
            submission_id,
            executableline_id,
            numeric_value_integer,
            numeric_value_decimal,
            created_at
          )
          VALUES
          (
            @submission_id,
            @executableline_id,
            @numeric_value_integer,
            @numeric_value_decimal,
            @created_at
          );
        `);
    }

    for (const row of normalizedAnswers.rango) {
      await new sql.Request(transaction)
        .input("submission_id", sql.Int, serverSubmissionId)
        .input("executableline_id", sql.Int, row.executablelineId)
        .input("range_min_integer", sql.Int, row.rangeMinInteger)
        .input("range_min_decimal", sql.Decimal(18, 6), row.rangeMinDecimal)
        .input("range_max_integer", sql.Int, row.rangeMaxInteger)
        .input("range_max_decimal", sql.Decimal(18, 6), row.rangeMaxDecimal)
        .input("created_at", sql.DateTime2, now)
        .query(`
          INSERT INTO ${APP_SCHEMA}.survey_answer_ranges
          (
            submission_id,
            executableline_id,
            range_min_integer,
            range_min_decimal,
            range_max_integer,
            range_max_decimal,
            created_at
          )
          VALUES
          (
            @submission_id,
            @executableline_id,
            @range_min_integer,
            @range_min_decimal,
            @range_max_integer,
            @range_max_decimal,
            @created_at
          );
        `);
    }

    for (const row of normalizedAnswers.text) {
      await new sql.Request(transaction)
        .input("submission_id", sql.Int, serverSubmissionId)
        .input("executableline_id", sql.Int, row.executablelineId)
        .input("text_value", sql.NVarChar(sql.MAX), row.textValue)
        .input("created_at", sql.DateTime2, now)
        .query(`
          INSERT INTO ${APP_SCHEMA}.survey_answer_texts
          (
            submission_id,
            executableline_id,
            text_value,
            created_at
          )
          VALUES
          (
            @submission_id,
            @executableline_id,
            @text_value,
            @created_at
          );
        `);
    }

    await transaction.commit();

  return {
    ack: true,
    deviceId: normalizeText(deviceId),
    submissionUuid: submissionToken,
    serverSubmissionId,
    receivedAt: new Date().toISOString(),
  };
  } catch (error) {
    if (transaction._aborted !== true) {
      await transaction.rollback();
    }
    throw error;
  }
}

export async function getPublicSurveyExecutableCrudDorado(executableCode) {
  const normalizedExecutableCode = normalizeText(executableCode);
  if (!normalizedExecutableCode) return null;

  const pool = await getAppPool();
  const executableResult = await pool.request().query(`
    SELECT
      e.id AS executable_id,
      e.doc_id,
      e.channel_code,
      e.version_number,
      e.is_active,
      e.published_at,
      d.code AS doc_code,
      d.title AS doc_name,
      d.objective,
      d.audience
    FROM ${APP_SCHEMA}.survey_executables e
    LEFT JOIN ${APP_SCHEMA}.survey_docs d
      ON d.id = e.doc_id
    WHERE e.is_active = 1
      AND ISNULL(e.channel_code, 'web') = 'web'
    ORDER BY e.published_at DESC, e.id DESC;
  `);

  const executableRow = (executableResult.recordset || []).find((row) => {
    const code = buildExecutableCode(
      Number(row.executable_id || 0),
      Number(row.doc_id || 0),
      Number(row.version_number || 1),
      row.channel_code || "web",
      String(row.doc_code || ""),
    );
    return code === normalizedExecutableCode;
  });

  if (!executableRow) return null;

  const executableId = Number(executableRow.executable_id || 0);

  const lineResult = await pool.request().input("executable_id", sql.Int, executableId).query(`
    SELECT
      l.id AS executableline_id,
      l.executable_id,
      l.question_text,
      l.question_type,
      l.sort_order,
      l.response_profile_id,
      p.code AS response_profile_code,
      p.input_type,
      p.section_type AS profile_section_type,
      ch.selection_mode,
      ch.min_selections,
      ch.max_selections,
      num.numeric_kind,
      num.min_value,
      num.max_value,
      num.precision_digits,
      txt.text_kind,
      txt.min_length AS min_chars,
      txt.max_length AS max_chars
    FROM ${APP_SCHEMA}.survey_executablelines l
    LEFT JOIN ${APP_SCHEMA}.survey_response_profiles p
      ON p.id = l.response_profile_id
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
        CAST(NULL AS DECIMAL(18, 6)) AS min_value,
        CAST(NULL AS DECIMAL(18, 6)) AS max_value,
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
        t.text_kind,
        t.min_length,
        t.max_length
      FROM ${APP_SCHEMA}.survey_response_profile_texts t
      WHERE t.profile_id = l.response_profile_id
      ORDER BY t.id DESC
    ) txt
    WHERE l.executable_id = @executable_id
    ORDER BY l.sort_order, l.id;
  `);

  const optionResult = await pool.request().input("executable_id", sql.Int, executableId).query(`
    SELECT
      o.id AS executableline_option_id,
      o.executableline_id,
      o.option_value,
      o.option_label,
      o.sort_order
    FROM ${APP_SCHEMA}.survey_executableline_options o
    INNER JOIN ${APP_SCHEMA}.survey_executablelines l
      ON l.id = o.executableline_id
    WHERE l.executable_id = @executable_id
    ORDER BY o.executableline_id, o.sort_order, o.id;
  `);

  const fallbackProfileOptionResult = await pool.request().input("executable_id", sql.Int, executableId).query(`
    SELECT
      l.id AS executableline_id,
      o.option_value,
      o.option_label,
      o.sort_order
    FROM ${APP_SCHEMA}.survey_executablelines l
    INNER JOIN ${APP_SCHEMA}.survey_response_profile_options o
      ON o.profile_id = l.response_profile_id
    WHERE l.executable_id = @executable_id
      AND o.is_active = 1
    ORDER BY l.id, o.sort_order, o.id;
  `);

  const bucketResult = await pool.request().input("executable_id", sql.Int, executableId).query(`
    SELECT
      b.id AS executableline_numeric_bucket_id,
      b.executableline_id,
      b.bucket_min,
      b.bucket_max,
      b.bucket_label,
      b.sort_order
    FROM ${APP_SCHEMA}.survey_executableline_numeric_buckets b
    INNER JOIN ${APP_SCHEMA}.survey_executablelines l
      ON l.id = b.executableline_id
    WHERE l.executable_id = @executable_id
    ORDER BY b.executableline_id, b.sort_order, b.id;
  `);

  const optionsByLineId = new Map();
  for (const row of optionResult.recordset || []) {
    const lineId = Number(row.executableline_id || 0);
    if (!optionsByLineId.has(lineId)) optionsByLineId.set(lineId, []);
    optionsByLineId.get(lineId).push({
      optionValue: normalizeText(row.option_value),
      optionLabel: normalizeText(row.option_label),
      optionOrder: Number(row.sort_order || 0) || 1,
    });
  }

  const fallbackOptionsByLineId = new Map();
  for (const row of fallbackProfileOptionResult.recordset || []) {
    const lineId = Number(row.executableline_id || 0);
    if (!fallbackOptionsByLineId.has(lineId)) fallbackOptionsByLineId.set(lineId, []);
    fallbackOptionsByLineId.get(lineId).push({
      optionValue: normalizeText(row.option_value),
      optionLabel: normalizeText(row.option_label),
      optionOrder: Number(row.sort_order || 0) || 1,
    });
  }

  const bucketsByLineId = new Map();
  for (const row of bucketResult.recordset || []) {
    const lineId = Number(row.executableline_id || 0);
    if (!bucketsByLineId.has(lineId)) bucketsByLineId.set(lineId, []);
    bucketsByLineId.get(lineId).push({
      bucketLabel: normalizeText(row.bucket_label),
      rangeMin: row.bucket_min == null ? null : Number(row.bucket_min),
      rangeMax: row.bucket_max == null ? null : Number(row.bucket_max),
      bucketOrder: Number(row.sort_order || 0) || 1,
    });
  }

  const lines = (lineResult.recordset || []).map((row) => {
    const lineId = Number(row.executableline_id || 0);
    const sectionType = normalizeText(row.profile_section_type || row.question_type).toLowerCase() || "text";
    const inputType = normalizeText(row.input_type).toLowerCase();
    const materializedOptions = optionsByLineId.get(lineId) || [];
    const isChoiceLike =
      sectionType === "likert" ||
      sectionType === "unica" ||
      sectionType === "multi" ||
      inputType.includes("single_choice") ||
      inputType.includes("multi_choice") ||
      inputType.includes("likert");
    const resolvedOptions = materializedOptions.length
      ? materializedOptions
      : isChoiceLike
        ? fallbackOptionsByLineId.get(lineId) || []
        : [];

    return {
      executableLineId: lineId,
      lineOrder: Number(row.sort_order || 0) || 1,
      sectionType,
      questionText: normalizeText(row.question_text),
      responseProfileCode: normalizeText(row.response_profile_code),
      inputType,
      selectionMode: normalizeText(row.selection_mode).toLowerCase(),
      minSelections: row.min_selections == null ? null : Number(row.min_selections),
      maxSelections: row.max_selections == null ? null : Number(row.max_selections),
      numericKind: normalizeText(row.numeric_kind).toLowerCase(),
      minValue: row.min_value == null ? null : Number(row.min_value),
      maxValue: row.max_value == null ? null : Number(row.max_value),
      precisionDigits: row.precision_digits == null ? null : Number(row.precision_digits),
      textKind: normalizeText(row.text_kind).toLowerCase(),
      minChars: row.min_chars == null ? null : Number(row.min_chars),
      maxChars: row.max_chars == null ? null : Number(row.max_chars),
      options: resolvedOptions,
      numericBuckets: bucketsByLineId.get(lineId) || [],
    };
  });

  return {
    executableId,
    executableCode: normalizedExecutableCode,
    docId: Number(executableRow.doc_id || 0),
    docCode: normalizeText(executableRow.doc_code),
    docName: normalizeText(executableRow.doc_name),
    objective: normalizeText(executableRow.objective),
    audience: normalizeText(executableRow.audience),
    publishedAt: executableRow.published_at ? String(executableRow.published_at) : null,
    publicationVersion: Number(executableRow.version_number || 1),
    lines,
  };
}
