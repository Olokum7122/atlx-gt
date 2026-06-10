import { getAppPool, sqlType } from "../../db/sql.js";

const sql = sqlType();
const APP_SCHEMA = "core_encuestas";

function normalizeText(value) {
  return String(value || "").trim();
}

function parseSectionTypes(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapSummaryRow(row) {
  return {
    id: String(row.doc_id || ""),
    docCode: String(row.doc_code || ""),
    name: String(row.doc_name || ""),
    objective: String(row.objective || ""),
    audience: String(row.audience || ""),
    statusCode: String(row.status_code || "draft"),
    sectionTypes: parseSectionTypes(row.section_types),
    reactiveCount: Number(row.reactive_count || 0),
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function mapItemRow(row) {
  return {
    id: String(row.docline_id || ""),
    lineOrder: Number(row.line_order || 0),
    sectionType: String(row.section_type || ""),
    questionText: String(row.question_text || ""),
    responseProfileId: String(row.response_profile_id || ""),
    responseInputCode: String(row.response_profile_code || ""),
  };
}

async function generateDocCode(transaction) {
  const result = await new sql.Request(transaction).query(`
    SELECT ISNULL(MAX(id), 0) + 1 AS next_id
    FROM ${APP_SCHEMA}.survey_docs;
  `);

  const nextId = Number(result.recordset?.[0]?.next_id || 1);
  return `DOC-ENC-${String(nextId).padStart(4, "0")}`;
}

async function resolveResponseProfileId(transaction, responseInputCode) {
  const result = await new sql.Request(transaction)
    .input("response_profile_code", sql.VarChar(80), normalizeText(responseInputCode).toUpperCase())
    .query(`
      SELECT TOP (1) id AS response_profile_id
      FROM ${APP_SCHEMA}.survey_response_profiles
      WHERE code = @response_profile_code
        AND is_active = 1
      ORDER BY id DESC;
    `);

  const responseProfileId = Number(result.recordset?.[0]?.response_profile_id || 0);
  if (!responseProfileId) {
    throw new Error(`responseInputCode no existe en biblioteca: ${responseInputCode}`);
  }
  return responseProfileId;
}

export async function listSurveyDocsCrudDorado() {
  const pool = await getAppPool();
  const result = await pool.request().query(`
    SELECT
      d.id AS doc_id,
      d.code AS doc_code,
      d.title AS doc_name,
      d.objective,
      d.audience,
      d.status AS status_code,
      d.created_at,
      d.updated_at,
      (
        SELECT COUNT(1)
        FROM ${APP_SCHEMA}.survey_doclines dl
        WHERE dl.doc_id = d.id
          AND dl.is_active = 1
      ) AS reactive_count,
      (
        SELECT STRING_AGG(x.section_type, ',')
        FROM (
          SELECT DISTINCT dl.section_type
          FROM ${APP_SCHEMA}.survey_doclines dl
          WHERE dl.doc_id = d.id
            AND dl.is_active = 1
        ) x
      ) AS section_types
    FROM ${APP_SCHEMA}.survey_docs d
    WHERE d.is_active = 1
    ORDER BY d.updated_at DESC, d.id DESC;
  `);

  return (result.recordset || []).map(mapSummaryRow);
}

export async function getSurveyDocByIdCrudDorado(id) {
  const docId = Number(id);
  if (!Number.isFinite(docId) || docId <= 0) return null;

  const pool = await getAppPool();
  const headerResult = await pool.request()
    .input("doc_id", sql.BigInt, docId)
    .query(`
      SELECT
        id AS doc_id,
        code AS doc_code,
        title AS doc_name,
        objective,
        audience,
        status AS status_code,
        is_active,
        created_at,
        updated_at
      FROM ${APP_SCHEMA}.survey_docs
      WHERE id = @doc_id;
    `);

  const header = headerResult.recordset?.[0];
  if (!header) return null;

  const itemResult = await pool.request()
    .input("doc_id", sql.BigInt, docId)
    .query(`
      SELECT
        id AS docline_id,
        line_order,
        section_type,
        question_text,
        response_profile_id,
        response_profile_code
      FROM ${APP_SCHEMA}.survey_doclines
      WHERE doc_id = @doc_id
        AND is_active = 1
      ORDER BY line_order, docline_id;
    `);

  return {
    id: String(header.doc_id || ""),
    docCode: String(header.doc_code || ""),
    name: String(header.doc_name || ""),
    objective: String(header.objective || ""),
    audience: String(header.audience || ""),
    statusCode: String(header.status_code || "draft"),
    isActive: Number(header.is_active ?? 1) === 1,
    createdAt: header.created_at ? String(header.created_at) : null,
    updatedAt: header.updated_at ? String(header.updated_at) : null,
    items: (itemResult.recordset || []).map(mapItemRow),
  };
}

export async function saveSurveyDocCrudDorado(draft) {
  const pool = await getAppPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    let docId = draft.id ? Number(draft.id) : null;
    const docCode = draft.docCode || (await generateDocCode(transaction));
    const isActive = draft.isActive !== false ? 1 : 0;

    if (docId) {
      const updateResult = await new sql.Request(transaction)
        .input("doc_id", sql.BigInt, docId)
        .input("doc_code", sql.NVarChar(40), docCode)
        .input("doc_name", sql.NVarChar(200), draft.name)
        .input("objective", sql.NVarChar(sql.MAX), draft.objective || null)
        .input("audience", sql.NVarChar(500), draft.audience || null)
        .input("status_code", sql.NVarChar(20), draft.statusCode || "draft")
        .input("is_active", sql.Bit, isActive)
        .query(`
          UPDATE ${APP_SCHEMA}.survey_docs
          SET
            code = @doc_code,
            title = @doc_name,
            description = @objective,
            objective = @objective,
            audience = @audience,
            status = @status_code,
            is_active = @is_active,
            updated_at = SYSUTCDATETIME()
          WHERE id = @doc_id;

          SELECT @@ROWCOUNT AS affected;
        `);

      const affected = Number(updateResult.recordset?.[0]?.affected || 0);
      if (!affected) {
        throw new Error("Encuesta no encontrada para actualizar");
      }
    } else {
      const insertResult = await new sql.Request(transaction)
        .input("doc_code", sql.NVarChar(40), docCode)
        .input("doc_name", sql.NVarChar(200), draft.name)
        .input("objective", sql.NVarChar(sql.MAX), draft.objective || null)
        .input("audience", sql.NVarChar(500), draft.audience || null)
        .input("status_code", sql.NVarChar(20), draft.statusCode || "draft")
        .input("is_active", sql.Bit, isActive)
        .query(`
          INSERT INTO ${APP_SCHEMA}.survey_docs
          (
            code,
            title,
            description,
            objective,
            audience,
            status,
            is_active,
            created_at,
            updated_at
          )
          OUTPUT inserted.id AS doc_id
          VALUES
          (
            @doc_code,
            @doc_name,
            @objective,
            @objective,
            @audience,
            @status_code,
            @is_active,
            SYSUTCDATETIME(),
            SYSUTCDATETIME()
          );
        `);
      docId = Number(insertResult.recordset?.[0]?.doc_id || 0);
    }

    await new sql.Request(transaction)
      .input("doc_id", sql.BigInt, docId)
      .query(`DELETE FROM ${APP_SCHEMA}.survey_doclines WHERE doc_id = @doc_id;`);

    let lineOrder = 1;
    for (const item of draft.items) {
      const responseProfileId = await resolveResponseProfileId(
        transaction,
        item.responseInputCode,
      );

      await new sql.Request(transaction)
        .input("doc_id", sql.BigInt, docId)
        .input("line_order", sql.Int, lineOrder)
        .input("section_type", sql.NVarChar(40), item.sectionType)
        .input("question_text", sql.NVarChar(sql.MAX), item.questionText)
        .input("response_profile_id", sql.BigInt, responseProfileId)
        .input("response_profile_code", sql.NVarChar(80), item.responseInputCode)
        .query(`
          INSERT INTO ${APP_SCHEMA}.survey_doclines
          (
            doc_id,
            line_order,
            section_type,
            question_text,
            response_profile_id,
            response_profile_code,
            is_active,
            created_at,
            updated_at
          )
          VALUES
          (
            @doc_id,
            @line_order,
            @section_type,
            @question_text,
            @response_profile_id,
            @response_profile_code,
            1,
            SYSUTCDATETIME(),
            SYSUTCDATETIME()
          );
        `);

      lineOrder += 1;
    }

    await transaction.commit();
    return getSurveyDocByIdCrudDorado(docId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteSurveyDocCrudDorado(id) {
  const docId = Number(id);
  if (!Number.isFinite(docId) || docId <= 0) {
    throw new Error("Identificador de encuesta inválido");
  }

  const pool = await getAppPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction)
      .input("doc_id", sql.BigInt, docId)
      .query(`DELETE FROM ${APP_SCHEMA}.survey_doclines WHERE doc_id = @doc_id;`);

    const deleteResult = await new sql.Request(transaction)
      .input("doc_id", sql.BigInt, docId)
      .query(`
        DELETE FROM ${APP_SCHEMA}.survey_docs
        WHERE id = @doc_id;

        SELECT @@ROWCOUNT AS affected;
      `);

    const affected = Number(deleteResult.recordset?.[0]?.affected || 0);
    if (!affected) {
      throw new Error("Encuesta no encontrada para eliminar");
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}