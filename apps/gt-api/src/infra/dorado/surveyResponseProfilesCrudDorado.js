import { getAppPool, sqlType } from "../../db/sql.js";

const sql = sqlType();
const APP_SCHEMA = "core_encuestas";

function normalizeText(value) {
  return String(value || "").trim();
}

function inferRangeFormatFromProfile(baseRow = {}) {
  const haystack = `${String(baseRow.profile_type || "")} ${String(baseRow.response_profile_code || "")}`
    .toLowerCase();
  return haystack.includes("dec") || haystack.includes("decimal") ? "decimal" : "integer";
}

async function getTableColumnSet(executor, tableName) {
  const request = executor instanceof sql.Transaction
    ? new sql.Request(executor)
    : executor.request();

  const result = await request
    .input("table_schema", sql.NVarChar(128), APP_SCHEMA)
    .input("table_name", sql.NVarChar(128), tableName)
    .query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @table_schema
        AND TABLE_NAME = @table_name;
    `);

  return new Set(
    (result.recordset || []).map((row) => String(row.COLUMN_NAME || "").toLowerCase()),
  );
}

function hasColumn(columns, columnName) {
  return columns.has(String(columnName || "").toLowerCase());
}

function mapListRow(row) {
  return {
    id: String(row.response_profile_id || ""),
    code: String(row.response_profile_code || ""),
    label: String(row.response_profile_name || ""),
    sectionType: String(row.section_type || ""),
    inputType: String(row.input_type || ""),
    profileType: String(row.profile_type || ""),
    isActive: Number(row.is_active ?? 1) === 1,
    optionCount: Number(row.option_count || 0),
    description: String(row.description || ""),
    config: {
      profileType: String(row.profile_type || ""),
      description: String(row.description || ""),
      maxSelections: row.max_selections == null ? null : Number(row.max_selections),
      min: null,
      max: null,
      format: (row.decimal_places ?? 0) > 0 ? "decimal" : "integer",
      integerValue:
        row.numeric_value_integer == null
          ? null
          : Number(row.numeric_value_integer),
      decimalValue:
        row.numeric_value_decimal == null
          ? null
          : Number(row.numeric_value_decimal),
      minChars: row.min_chars == null ? null : Number(row.min_chars),
      maxChars: row.max_chars == null ? null : Number(row.max_chars),
    },
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function buildDetailConfig(baseRow, detailRow = {}) {
  return {
    profileType: String(baseRow.profile_type || ""),
    description: String(baseRow.description || ""),
    scalePoints: detailRow.scale_points == null ? null : Number(detailRow.scale_points),
    maxSelections: detailRow.max_selections == null ? null : Number(detailRow.max_selections),
    min: null,
    max: null,
    format: (detailRow.decimal_places ?? 0) > 0 ? "decimal" : "integer",
    integerValue:
      detailRow.numeric_value_integer == null
        ? null
        : Number(detailRow.numeric_value_integer),
    decimalValue:
      detailRow.numeric_value_decimal == null
        ? null
        : Number(detailRow.numeric_value_decimal),
    minChars: detailRow.min_chars == null ? null : Number(detailRow.min_chars),
    maxChars: detailRow.max_chars == null ? null : Number(detailRow.max_chars),
  };
}

function likertOptionsFromRow(row) {
  return [
    row.option_1_label,
    row.option_2_label,
    row.option_3_label,
    row.option_4_label,
    row.option_5_label,
  ]
    .map((label, index) => ({
      id: `likert-${index + 1}`,
      optionOrder: index + 1,
      optionLabel: String(label || ""),
      optionValue: String(index + 1),
      weight: index + 1,
    }))
    .filter((item) => item.optionLabel);
}

async function getChoiceOptions(pool, responseProfileId) {
  const result = await pool.request()
    .input("response_profile_id", sql.BigInt, responseProfileId)
    .query(`
      SELECT
        id AS response_profile_option_id,
        option_value AS option_code,
        option_label,
        sort_order AS option_order,
        option_score
      FROM ${APP_SCHEMA}.survey_response_profile_options
      WHERE profile_id = @response_profile_id
        AND is_active = 1
      ORDER BY sort_order;
    `);

  return (result.recordset || []).map((row) => ({
    id: String(row.response_profile_option_id || ""),
    optionOrder: Number(row.option_order || 0),
    optionLabel: String(row.option_label || ""),
    optionValue: String(row.option_code || ""),
    weight: row.option_score == null ? null : Number(row.option_score),
  }));
}

async function getDetailPayload(pool, baseRow) {
  const responseProfileId = Number(baseRow.response_profile_id || 0);

  if (baseRow.section_type === "likert") {
    const result = await pool.request()
      .input("response_profile_id", sql.BigInt, responseProfileId)
      .query(`
        SELECT TOP (1)
          scale_points,
          option_1_label,
          option_2_label,
          option_3_label,
          option_4_label,
          option_5_label,
          scale_labels
        FROM ${APP_SCHEMA}.survey_response_profile_likerts
        WHERE profile_id = @response_profile_id
        ORDER BY id DESC;
      `);
    const detail = result.recordset?.[0] || {};
    return {
      config: buildDetailConfig(baseRow, detail),
      options: likertOptionsFromRow(detail),
    };
  }

  if (baseRow.section_type === "multi") {
    const detailResult = await pool.request()
      .input("response_profile_id", sql.BigInt, responseProfileId)
      .query(`
        SELECT TOP (1)
          selection_mode,
          min_selections,
          max_selections
        FROM ${APP_SCHEMA}.survey_response_profile_choices
        WHERE profile_id = @response_profile_id
        ORDER BY id DESC;
      `);
    const detail = detailResult.recordset?.[0] || {};
    const options = await getChoiceOptions(pool, responseProfileId);
    return {
      config: buildDetailConfig(baseRow, detail),
      options,
    };
  }

  if (baseRow.section_type === "unica") {
    const options = await getChoiceOptions(pool, responseProfileId);
    return {
      config: buildDetailConfig(baseRow, { max_selections: 1 }),
      options,
    };
  }

  if (baseRow.input_type === "long_text") {
    const result = await pool.request()
      .input("response_profile_id", sql.BigInt, responseProfileId)
      .query(`
        SELECT TOP (1)
          text_kind,
          min_length AS min_chars,
          max_length AS max_chars
        FROM ${APP_SCHEMA}.survey_response_profile_texts
        WHERE profile_id = @response_profile_id
        ORDER BY id DESC;
      `);
    const detail = result.recordset?.[0] || {};
    return {
      config: buildDetailConfig(baseRow, detail),
      options: [],
    };
  }

  const numericResult = await pool.request()
    .input("response_profile_id", sql.BigInt, responseProfileId)
    .query(`
      SELECT TOP (1)
        decimal_places,
        numeric_value_integer,
        numeric_value_decimal
      FROM ${APP_SCHEMA}.survey_response_profile_numerics
      WHERE profile_id = @response_profile_id
      ORDER BY id DESC;
    `);
  const detail = numericResult.recordset?.[0] || {};

  if (baseRow.section_type === "rango") {
    const rangeResult = await pool.request()
      .input("response_profile_id", sql.BigInt, responseProfileId)
      .query(`
        SELECT TOP (1)
          range_min_integer,
          range_max_integer,
          range_min_decimal,
          range_max_decimal
        FROM ${APP_SCHEMA}.survey_response_profile_ranges
        WHERE profile_id = @response_profile_id
        ORDER BY id DESC;
      `);
    const rng = rangeResult.recordset?.[0] || {};
    const hasDecimalRange = rng.range_min_decimal != null || rng.range_max_decimal != null;
    const hasIntegerRange = rng.range_min_integer != null || rng.range_max_integer != null;
    const rangeFormat = hasDecimalRange
      ? "decimal"
      : hasIntegerRange
        ? "integer"
        : inferRangeFormatFromProfile(baseRow);
    const minValue = hasDecimalRange
      ? rng.range_min_decimal
      : rng.range_min_integer;
    const maxValue = hasDecimalRange
      ? rng.range_max_decimal
      : rng.range_max_integer;
    return {
      config: {
        profileType: String(baseRow.profile_type || ""),
        description: String(baseRow.description || ""),
        format: rangeFormat,
        rangeMinInteger:
          rng.range_min_integer == null ? null : Number(rng.range_min_integer),
        rangeMaxInteger:
          rng.range_max_integer == null ? null : Number(rng.range_max_integer),
        rangeMinDecimal:
          rng.range_min_decimal == null ? null : Number(rng.range_min_decimal),
        rangeMaxDecimal:
          rng.range_max_decimal == null ? null : Number(rng.range_max_decimal),
        minMin: minValue == null ? null : Number(minValue),
        minMax: null,
        maxMin: null,
        maxMax: maxValue == null ? null : Number(maxValue),
      },
      options: [],
    };
  }

  return {
    config: buildDetailConfig(baseRow, detail),
    options: [],
  };
}

async function replaceDetailRows(transaction, draft, responseProfileId, columnSets = {}) {
  const baseRequest = () =>
    new sql.Request(transaction).input("response_profile_id", sql.BigInt, responseProfileId);

  const choiceColumns = columnSets.choiceColumns || new Set();
  const optionColumns = columnSets.optionColumns || new Set();
  const likertColumns = columnSets.likertColumns || new Set();
  const numericColumns = columnSets.numericColumns || new Set();
  const textColumns = columnSets.textColumns || new Set();

  await baseRequest().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_likerts WHERE profile_id = @response_profile_id;`);
  await baseRequest().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_choices WHERE profile_id = @response_profile_id;`);
  await baseRequest().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_numerics WHERE profile_id = @response_profile_id;`);
  await baseRequest().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_ranges WHERE profile_id = @response_profile_id;`);
  await baseRequest().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_texts WHERE profile_id = @response_profile_id;`);
  await baseRequest().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_options WHERE profile_id = @response_profile_id;`);

  if (draft.sectionType === "likert") {
    const labels = draft.options
      .map((option) => String(option.optionLabel || "").trim())
      .filter(Boolean);

    const likertRequest = new sql.Request(transaction)
      .input("response_profile_id", sql.BigInt, responseProfileId)
      .input("scale_labels", sql.NVarChar(500), labels.join("|"))
      .input("option_1_label", sql.VarChar(120), draft.options[0]?.optionLabel || "")
      .input("option_2_label", sql.VarChar(120), draft.options[1]?.optionLabel || "")
      .input("option_3_label", sql.VarChar(120), draft.options[2]?.optionLabel || "")
      .input("option_4_label", sql.VarChar(120), draft.options[3]?.optionLabel || "")
      .input("option_5_label", sql.VarChar(120), draft.options[4]?.optionLabel || "")
      .input("scale_points", sql.Int, 5);

    const likertColumnsList = ["profile_id", "scale_min", "scale_max", "scale_labels"];
    const likertValuesList = ["@response_profile_id", "1", "5", "@scale_labels"];

    if (hasColumn(likertColumns, "scale_points")) {
      likertColumnsList.push("scale_points");
      likertValuesList.push("@scale_points");
    }
    for (const labelColumn of ["option_1_label", "option_2_label", "option_3_label", "option_4_label", "option_5_label"]) {
      if (hasColumn(likertColumns, labelColumn)) {
        likertColumnsList.push(labelColumn);
        likertValuesList.push(`@${labelColumn}`);
      }
    }
    likertColumnsList.push("created_at");
    likertValuesList.push("SYSUTCDATETIME()");

    await likertRequest.query(`
      INSERT INTO ${APP_SCHEMA}.survey_response_profile_likerts
      (
        ${likertColumnsList.join(",\n        ")}
      )
      VALUES
      (
        ${likertValuesList.join(",\n        ")}
      );
    `);
    return;
  }

  if (draft.sectionType === "unica" || draft.sectionType === "multi") {
    const selectionMode = draft.sectionType === "multi" ? "multiple" : "single";
    const maxSelections = draft.sectionType === "multi" ? (Number(draft.config?.maxSelections ?? 1) || 1) : 1;

    const seedOption = draft.options[0] || { optionLabel: draft.label, optionValue: "1", optionOrder: 1 };
    const choiceRequest = new sql.Request(transaction)
      .input("response_profile_id", sql.BigInt, responseProfileId)
      .input("selection_mode", sql.VarChar(20), selectionMode)
      .input("min_selections", sql.Int, 1)
      .input("max_selections", sql.Int, maxSelections)
      .input("choice_value", sql.VarChar(100), normalizeText(seedOption.optionValue || seedOption.optionOrder || "1"))
      .input("choice_label", sql.VarChar(200), normalizeText(seedOption.optionLabel || draft.label))
      .input("sort_order", sql.Int, Number(seedOption.optionOrder || 1));

    const choiceColumnsList = ["profile_id"];
    const choiceValuesList = ["@response_profile_id"];
    if (hasColumn(choiceColumns, "choice_value")) {
      choiceColumnsList.push("choice_value");
      choiceValuesList.push("@choice_value");
    }
    if (hasColumn(choiceColumns, "choice_label")) {
      choiceColumnsList.push("choice_label");
      choiceValuesList.push("@choice_label");
    }
    if (hasColumn(choiceColumns, "sort_order")) {
      choiceColumnsList.push("sort_order");
      choiceValuesList.push("@sort_order");
    }
    for (const optionalColumn of ["selection_mode", "min_selections", "max_selections"]) {
      if (hasColumn(choiceColumns, optionalColumn)) {
        choiceColumnsList.push(optionalColumn);
        choiceValuesList.push(`@${optionalColumn}`);
      }
    }
    if (hasColumn(choiceColumns, "allow_other")) {
      choiceColumnsList.push("allow_other");
      choiceValuesList.push("0");
    }
    if (hasColumn(choiceColumns, "randomize_options")) {
      choiceColumnsList.push("randomize_options");
      choiceValuesList.push("0");
    }
    choiceColumnsList.push("created_at");
    choiceValuesList.push("SYSUTCDATETIME()");

    await choiceRequest.query(`
      INSERT INTO ${APP_SCHEMA}.survey_response_profile_choices
      (
        ${choiceColumnsList.join(",\n        ")}
      )
      VALUES
      (
        ${choiceValuesList.join(",\n        ")}
      );
    `);

    for (const option of draft.options) {
      const optionRequest = new sql.Request(transaction)
        .input("response_profile_id", sql.BigInt, responseProfileId)
        .input("option_code", sql.VarChar(40), normalizeText(option.optionValue || option.optionOrder))
        .input("option_label", sql.VarChar(180), option.optionLabel)
        .input("option_order", sql.Int, option.optionOrder)
        .input("option_score", sql.Decimal(10, 2), option.weight == null ? null : option.weight);

      const optionColumnsList = ["profile_id", "option_value", "option_label", "sort_order"];
      const optionValuesList = ["@response_profile_id", "@option_code", "@option_label", "@option_order"];
      if (hasColumn(optionColumns, "is_active")) {
        optionColumnsList.push("is_active");
        optionValuesList.push("1");
      }
      if (hasColumn(optionColumns, "option_score")) {
        optionColumnsList.push("option_score");
        optionValuesList.push("@option_score");
      }
      if (hasColumn(optionColumns, "is_other")) {
        optionColumnsList.push("is_other");
        optionValuesList.push("0");
      }
      optionColumnsList.push("created_at");
      optionValuesList.push("SYSUTCDATETIME()");

      await optionRequest.query(`
        INSERT INTO ${APP_SCHEMA}.survey_response_profile_options
        (
          ${optionColumnsList.join(",\n          ")}
        )
        VALUES
        (
          ${optionValuesList.join(",\n          ")}
        );
      `);
    }
    return;
  }

  if (draft.inputType === "long_text") {
    const textRequest = new sql.Request(transaction)
      .input("response_profile_id", sql.BigInt, responseProfileId)
      .input("text_kind", sql.VarChar(20), "long_text")
      .input("min_chars", sql.Int, Number(draft.config?.minChars ?? 0) || 0)
      .input("max_chars", sql.Int, Number(draft.config?.maxChars ?? 500) || 500);

    const textColumnsList = ["profile_id", "min_length", "max_length", "is_multiline"];
    const textValuesList = ["@response_profile_id", "@min_chars", "@max_chars", "1"];
    if (hasColumn(textColumns, "text_kind")) {
      textColumnsList.push("text_kind");
      textValuesList.push("@text_kind");
    }
    textColumnsList.push("created_at");
    textValuesList.push("SYSUTCDATETIME()");

    await textRequest.query(`
      INSERT INTO ${APP_SCHEMA}.survey_response_profile_texts
      (
        ${textColumnsList.join(",\n        ")}
      )
      VALUES
      (
        ${textValuesList.join(",\n        ")}
      );
    `);
    return;
  }

  if (draft.sectionType === "rango") {
    const isDecimalRange = normalizeText(draft.config?.format || "integer") === "decimal";
    const integerMin = draft.config?.rangeMinInteger ?? null;
    const integerMax = draft.config?.rangeMaxInteger ?? null;
    const decimalMin = draft.config?.rangeMinDecimal ?? null;
    const decimalMax = draft.config?.rangeMaxDecimal ?? null;
    const normalizedMin = draft.config?.minMin ?? draft.config?.minMax ?? null;
    const normalizedMax = draft.config?.maxMax ?? draft.config?.maxMin ?? null;

    const persistedIntMin = isDecimalRange
      ? null
      : (integerMin != null ? Math.trunc(Number(integerMin)) : (normalizedMin == null ? null : Math.trunc(Number(normalizedMin))));
    const persistedIntMax = isDecimalRange
      ? null
      : (integerMax != null ? Math.trunc(Number(integerMax)) : (normalizedMax == null ? null : Math.trunc(Number(normalizedMax))));
    const persistedDecMin = isDecimalRange
      ? (decimalMin != null ? Number(decimalMin) : (normalizedMin == null ? null : Number(normalizedMin)))
      : null;
    const persistedDecMax = isDecimalRange
      ? (decimalMax != null ? Number(decimalMax) : (normalizedMax == null ? null : Number(normalizedMax)))
      : null;

    await new sql.Request(transaction)
      .input("response_profile_id", sql.BigInt, responseProfileId)
      .input("range_min_integer", sql.Int, persistedIntMin)
      .input("range_max_integer", sql.Int, persistedIntMax)
      .input("range_min_decimal", sql.Decimal(18, 6), persistedDecMin)
      .input("range_max_decimal", sql.Decimal(18, 6), persistedDecMax)
      .query(`
        INSERT INTO ${APP_SCHEMA}.survey_response_profile_ranges
        (profile_id, range_min_integer, range_max_integer, range_min_decimal, range_max_decimal, created_at)
        VALUES
        (@response_profile_id, @range_min_integer, @range_max_integer, @range_min_decimal, @range_max_decimal, SYSUTCDATETIME());
      `);
    return;
  }

  const numericKind = normalizeText(draft.config?.format || "integer") || "integer";
  const precisionDigits = numericKind === "decimal" ? 2 : 0;
  const rawIntegerValue = draft.config?.integerValue;
  const rawDecimalValue = draft.config?.decimalValue;
  const integerValue =
    rawIntegerValue === "" || rawIntegerValue == null
      ? null
      : Math.trunc(Number(rawIntegerValue));
  const decimalValue =
    rawDecimalValue === "" || rawDecimalValue == null
      ? null
      : Number(rawDecimalValue);

  const numericRequest = new sql.Request(transaction)
    .input("response_profile_id", sql.BigInt, responseProfileId)
    .input("numeric_value_integer", sql.Int, precisionDigits > 0 ? null : integerValue)
    .input("numeric_value_decimal", sql.Decimal(18, 6), precisionDigits > 0 ? decimalValue : null)
    .input("precision_digits", sql.Int, precisionDigits);

  const numericColumnsList = ["profile_id", "numeric_value_integer", "numeric_value_decimal", "decimal_places"];
  const numericValuesList = ["@response_profile_id", "@numeric_value_integer", "@numeric_value_decimal", "@precision_digits"];
  numericColumnsList.push("created_at");
  numericValuesList.push("SYSUTCDATETIME()");

  await numericRequest.query(`
    INSERT INTO ${APP_SCHEMA}.survey_response_profile_numerics
    (
      ${numericColumnsList.join(",\n      ")}
    )
    VALUES
    (
      ${numericValuesList.join(",\n      ")}
    );
  `);
}

export async function listSurveyResponseProfilesCrudDorado({ includeInactive, sectionType }) {
  const pool = await getAppPool();
  const request = pool.request();
  const filters = [];

  if (!includeInactive) {
    filters.push("p.is_active = 1");
  }
  if (normalizeText(sectionType)) {
    request.input("section_type", sql.VarChar(40), normalizeText(sectionType).toLowerCase());
    filters.push("p.section_type = @section_type");
  }

  const result = await request.query(`
    SELECT
      p.response_profile_id,
      p.response_profile_code,
      p.response_profile_name,
      p.section_type,
      p.profile_type,
      p.input_type,
      p.is_active,
      p.description,
      p.created_at,
      p.updated_at,
      COUNT(o.response_profile_option_id) AS option_count,
      MAX(c.max_selections) AS max_selections,
      MAX(n.decimal_places) AS decimal_places,
      MAX(n.numeric_value_integer) AS numeric_value_integer,
      MAX(n.numeric_value_decimal) AS numeric_value_decimal,
      MAX(t.min_length) AS min_chars,
      MAX(t.max_length) AS max_chars
    FROM (
      SELECT
        id AS response_profile_id,
        code AS response_profile_code,
        name AS response_profile_name,
        section_type,
        profile_type,
        input_type,
        is_active,
        description,
        created_at,
        updated_at
      FROM ${APP_SCHEMA}.survey_response_profiles
    ) p
    LEFT JOIN (
      SELECT
        id AS response_profile_option_id,
        profile_id AS response_profile_id,
        is_active
      FROM ${APP_SCHEMA}.survey_response_profile_options
    ) o
      ON o.response_profile_id = p.response_profile_id
      AND o.is_active = 1
    LEFT JOIN ${APP_SCHEMA}.survey_response_profile_choices c
      ON c.profile_id = p.response_profile_id
    LEFT JOIN ${APP_SCHEMA}.survey_response_profile_numerics n
      ON n.profile_id = p.response_profile_id
    LEFT JOIN ${APP_SCHEMA}.survey_response_profile_texts t
      ON t.profile_id = p.response_profile_id
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
    GROUP BY
      p.response_profile_id,
      p.response_profile_code,
      p.response_profile_name,
      p.section_type,
      p.profile_type,
      p.input_type,
      p.is_active,
      p.description,
      p.created_at,
      p.updated_at
    ORDER BY p.section_type, p.response_profile_code;
  `);

  return (result.recordset || []).map(mapListRow);
}

export async function getSurveyResponseProfileByIdCrudDorado(id) {
  const responseProfileId = Number(id);
  if (!Number.isFinite(responseProfileId) || responseProfileId <= 0) return null;

  const pool = await getAppPool();
  const result = await pool.request()
    .input("response_profile_id", sql.BigInt, responseProfileId)
    .query(`
      SELECT
        id AS response_profile_id,
        code AS response_profile_code,
        name AS response_profile_name,
        section_type,
        profile_type,
        input_type,
        is_active,
        description,
        created_at,
        updated_at
      FROM ${APP_SCHEMA}.survey_response_profiles
      WHERE id = @response_profile_id;
    `);

  const row = result.recordset?.[0];
  if (!row) return null;

  const detail = await getDetailPayload(pool, row);
  return {
    id: String(row.response_profile_id || ""),
    code: String(row.response_profile_code || ""),
    label: String(row.response_profile_name || ""),
    sectionType: String(row.section_type || ""),
    inputType: String(row.input_type || ""),
    profileType: String(row.profile_type || ""),
    isActive: Number(row.is_active ?? 1) === 1,
    description: String(row.description || ""),
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    config: detail.config,
    options: detail.options,
  };
}

export async function saveSurveyResponseProfileCrudDorado(draft) {
  const pool = await getAppPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const profileColumns = await getTableColumnSet(transaction, "survey_response_profiles");
    const choiceColumns = await getTableColumnSet(transaction, "survey_response_profile_choices");
    const optionColumns = await getTableColumnSet(transaction, "survey_response_profile_options");
    const likertColumns = await getTableColumnSet(transaction, "survey_response_profile_likerts");
    const numericColumns = await getTableColumnSet(transaction, "survey_response_profile_numerics");
    const textColumns = await getTableColumnSet(transaction, "survey_response_profile_texts");

    const responseProfileId = draft.id ? Number(draft.id) : null;
    let savedId = responseProfileId;
    const isActive = draft.isActive !== false ? 1 : 0;
    const profileType = draft.config?.profileType || draft.code.toLowerCase();
    const description = draft.config?.description || null;

    const buildProfileRequest = () => new sql.Request(transaction)
      .input("response_profile_code", sql.VarChar(80), draft.code)
      .input("response_profile_name", sql.VarChar(180), draft.label)
      .input("section_type", sql.VarChar(40), draft.sectionType)
      .input("profile_type", sql.VarChar(80), profileType)
      .input("input_type", sql.VarChar(40), draft.inputType)
      .input("description", sql.VarChar(500), description)
      .input("is_active", sql.Bit, isActive);

    const updateAssignments = [
      "code = @response_profile_code",
      "name = @response_profile_name",
      "description = @description",
      "is_active = @is_active",
      "updated_at = SYSUTCDATETIME()",
    ];
    if (hasColumn(profileColumns, "section_type")) updateAssignments.splice(2, 0, "section_type = @section_type");
    if (hasColumn(profileColumns, "profile_type")) updateAssignments.splice(hasColumn(profileColumns, "section_type") ? 3 : 2, 0, "profile_type = @profile_type");
    if (hasColumn(profileColumns, "input_type")) updateAssignments.splice(hasColumn(profileColumns, "section_type") && hasColumn(profileColumns, "profile_type") ? 4 : updateAssignments.length - 2, 0, "input_type = @input_type");

    const insertColumns = ["code", "name"];
    const insertValues = ["@response_profile_code", "@response_profile_name"];
    if (hasColumn(profileColumns, "section_type")) {
      insertColumns.push("section_type");
      insertValues.push("@section_type");
    }
    if (hasColumn(profileColumns, "profile_type")) {
      insertColumns.push("profile_type");
      insertValues.push("@profile_type");
    }
    if (hasColumn(profileColumns, "input_type")) {
      insertColumns.push("input_type");
      insertValues.push("@input_type");
    }
    if (hasColumn(profileColumns, "description")) {
      insertColumns.push("description");
      insertValues.push("@description");
    }
    if (hasColumn(profileColumns, "is_active")) {
      insertColumns.push("is_active");
      insertValues.push("@is_active");
    }
    insertColumns.push("created_at", "updated_at");
    insertValues.push("SYSUTCDATETIME()", "SYSUTCDATETIME()");

    if (savedId) {
      await buildProfileRequest()
        .input("response_profile_id", sql.BigInt, savedId)
        .query(`
          UPDATE ${APP_SCHEMA}.survey_response_profiles
          SET
            ${updateAssignments.join(",\n            ")}
          WHERE id = @response_profile_id;
        `);
    } else {
      const existingByCode = await new sql.Request(transaction)
        .input("response_profile_code", sql.VarChar(80), draft.code)
        .query(`
          SELECT TOP (1) id AS response_profile_id
          FROM ${APP_SCHEMA}.survey_response_profiles
          WHERE code = @response_profile_code
          ORDER BY id DESC;
        `);

      const existingId = Number(existingByCode.recordset?.[0]?.response_profile_id || 0);
      if (existingId > 0) {
        savedId = existingId;
        await buildProfileRequest()
          .input("response_profile_id", sql.BigInt, savedId)
          .query(`
            UPDATE ${APP_SCHEMA}.survey_response_profiles
            SET
              ${updateAssignments.join(",\n              ")}
            WHERE id = @response_profile_id;
          `);
      } else {
        const insertResult = await buildProfileRequest()
          .query(`
            INSERT INTO ${APP_SCHEMA}.survey_response_profiles
            (
              ${insertColumns.join(",\n              ")}
            )
            OUTPUT inserted.id AS response_profile_id
            VALUES
            (
              ${insertValues.join(",\n              ")}
            );
          `);
        savedId = Number(insertResult.recordset?.[0]?.response_profile_id || 0);
      }
    }

    await replaceDetailRows(transaction, draft, savedId, {
      choiceColumns,
      optionColumns,
      likertColumns,
      numericColumns,
      textColumns,
    });

    await transaction.commit();
    return String(savedId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteSurveyResponseProfileCrudDorado(id) {
  const responseProfileId = Number(id);
  if (!Number.isFinite(responseProfileId) || responseProfileId <= 0) {
    throw new Error("Invalid survey response profile id");
  }

  const pool = await getAppPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const request = () =>
      new sql.Request(transaction).input(
        "response_profile_id",
        sql.BigInt,
        responseProfileId,
      );

    await request().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_options WHERE profile_id = @response_profile_id;`);
    await request().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_choices WHERE profile_id = @response_profile_id;`);
    await request().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_likerts WHERE profile_id = @response_profile_id;`);
    await request().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_numerics WHERE profile_id = @response_profile_id;`);
    await request().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_texts WHERE profile_id = @response_profile_id;`);
    await request().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_numeric_buckets WHERE profile_id = @response_profile_id;`);
    await request().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profile_ranges WHERE profile_id = @response_profile_id;`);
    await request().query(`DELETE FROM ${APP_SCHEMA}.survey_response_profiles WHERE id = @response_profile_id;`);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}