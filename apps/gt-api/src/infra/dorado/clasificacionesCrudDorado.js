import crypto from "node:crypto";
import { getAppPool, sqlType } from "../../db/sql.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "_");
}

function normalizeName(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function toPairRow(row) {
  return {
    rowId: String(row.row_id || ""),
    id: String(row.row_id || ""),
    parentId: row.parent_id ? String(row.parent_id) : null,
    categoryId: String(row.category_id || ""),
    categoryName: String(row.category_name || ""),
    clasificacion: String(row.clasificacion || ""),
    subclasificacion: String(row.subclasificacion || ""),
    parentCode: String(row.parent_code || ""),
    childCode: String(row.child_code || ""),
    isActive: Number(row.is_active ?? 1) === 1,
    sortOrder:
      row.sort_order === null || row.sort_order === undefined
        ? null
        : Number(row.sort_order),
  };
}

async function getClasificacionRowById(txOrPool, id) {
  const clasificacionId = normalizeText(id);
  if (!clasificacionId) return null;

  const req = new sql.Request(txOrPool);
  const result = await req
    .input("classification_id", sql.NVarChar(100), clasificacionId)
    .query(`
      SELECT TOP 1
        classification_id,
        category_id,
        parent_classification_id,
        code,
        name,
        hierarchy_level,
        sort_order,
        is_active
      FROM core_configuracion.cat_clasificaciones
      WHERE classification_id = @classification_id;
    `);

  const row = result.recordset?.[0];
  if (!row) return null;

  return {
    id: String(row.classification_id || ""),
    categoryId: String(row.category_id || ""),
    parentId: row.parent_classification_id
      ? String(row.parent_classification_id)
      : null,
    code: String(row.code || ""),
    name: String(row.name || ""),
    hierarchyLevel: Number(row.hierarchy_level || 1),
    sortOrder:
      row.sort_order === null || row.sort_order === undefined
        ? null
        : Number(row.sort_order),
    isActive: Number(row.is_active ?? 1) === 1,
  };
}

async function getOrCreateParent(tx, draft) {
  const categoryId = normalizeText(draft.categoryId);
  const normalizedName = normalizeName(draft.parentName);
  const parentCode = normalizeCode(draft.parentCode);
  const parentName = normalizeText(draft.parentName);
  const isActive = draft.isActive !== false;

  let existing = null;

  if (normalizedName) {
    const byNameReq = new sql.Request(tx);
    const byNameResult = await byNameReq
      .input("category_id", sql.NVarChar(100), categoryId)
      .input("normalized_name", sql.NVarChar(300), normalizedName)
      .query(`
        SELECT TOP 1
          classification_id,
          code,
          name,
          sort_order,
          is_active
        FROM core_configuracion.cat_clasificaciones
        WHERE category_id = @category_id
          AND parent_classification_id IS NULL
          AND UPPER(name COLLATE Latin1_General_100_CI_AI) = @normalized_name
        ORDER BY updated_at DESC;
      `);

    const row = byNameResult.recordset?.[0];
    if (row) {
      existing = {
        id: String(row.classification_id || ""),
        code: String(row.code || ""),
        sortOrder:
          row.sort_order === null || row.sort_order === undefined
            ? null
            : Number(row.sort_order),
      };
    }
  }

  if (!existing && parentCode) {
    const byCodeReq = new sql.Request(tx);
    const byCodeResult = await byCodeReq
      .input("category_id", sql.NVarChar(100), categoryId)
      .input("code", sql.NVarChar(120), parentCode)
      .query(`
        SELECT TOP 1
          classification_id,
          code,
          name,
          sort_order,
          is_active
        FROM core_configuracion.cat_clasificaciones
        WHERE category_id = @category_id
          AND parent_classification_id IS NULL
          AND UPPER(code) = @code
        ORDER BY updated_at DESC;
      `);

    const row = byCodeResult.recordset?.[0];
    if (row) {
      existing = {
        id: String(row.classification_id || ""),
        code: String(row.code || ""),
        sortOrder:
          row.sort_order === null || row.sort_order === undefined
            ? null
            : Number(row.sort_order),
      };
    }
  }

  if (existing?.id) {
    const updateReq = new sql.Request(tx);
    await updateReq
      .input("classification_id", sql.NVarChar(100), existing.id)
      .input("code", sql.NVarChar(120), parentCode || existing.code)
      .input("name", sql.NVarChar(300), parentName)
      .input("is_active", sql.Bit, isActive ? 1 : 0)
      .input(
        "sort_order",
        sql.Int,
        draft.sortOrder === null || draft.sortOrder === undefined
          ? existing.sortOrder || 0
          : draft.sortOrder,
      )
      .query(`
        UPDATE core_configuracion.cat_clasificaciones
        SET
          code = @code,
          name = @name,
          hierarchy_level = 1,
          is_active = @is_active,
          sort_order = @sort_order,
          updated_at = SYSUTCDATETIME()
        WHERE classification_id = @classification_id;
      `);

    return { id: existing.id, created: false };
  }

  const parentId = crypto.randomUUID();
  const insertReq = new sql.Request(tx);
  await insertReq
    .input("classification_id", sql.NVarChar(100), parentId)
    .input("category_id", sql.NVarChar(100), categoryId)
    .input("code", sql.NVarChar(120), parentCode)
    .input("name", sql.NVarChar(300), parentName)
    .input("is_active", sql.Bit, isActive ? 1 : 0)
    .input("sort_order", sql.Int, draft.sortOrder ?? 0)
    .query(`
      INSERT INTO core_configuracion.cat_clasificaciones (
        classification_id,
        category_id,
        parent_classification_id,
        code,
        name,
        hierarchy_level,
        sort_order,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        @classification_id,
        @category_id,
        NULL,
        @code,
        @name,
        1,
        @sort_order,
        @is_active,
        SYSUTCDATETIME(),
        SYSUTCDATETIME()
      );
    `);

  return { id: parentId, created: true };
}

async function insertChild(tx, draft, parentId) {
  const childId = crypto.randomUUID();
  const req = new sql.Request(tx);
  await req
    .input("classification_id", sql.NVarChar(100), childId)
    .input("category_id", sql.NVarChar(100), normalizeText(draft.categoryId))
    .input(
      "parent_classification_id",
      sql.NVarChar(100),
      normalizeText(parentId),
    )
    .input("code", sql.NVarChar(120), normalizeCode(draft.childCode))
    .input("name", sql.NVarChar(300), normalizeText(draft.childName))
    .input("is_active", sql.Bit, draft.isActive !== false ? 1 : 0)
    .input("sort_order", sql.Int, draft.sortOrder ?? 0)
    .query(`
      INSERT INTO core_configuracion.cat_clasificaciones (
        classification_id,
        category_id,
        parent_classification_id,
        code,
        name,
        hierarchy_level,
        sort_order,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        @classification_id,
        @category_id,
        @parent_classification_id,
        @code,
        @name,
        2,
        @sort_order,
        @is_active,
        SYSUTCDATETIME(),
        SYSUTCDATETIME()
      );
    `);
  return childId;
}

async function updateClasificacion(tx, existing, draft) {
  const req = new sql.Request(tx);

  if (existing.parentId) {
    const childName = normalizeText(draft.childName) || existing.name;
    const childCode =
      normalizeCode(draft.childCode) || normalizeCode(existing.code);
    await req
      .input("classification_id", sql.NVarChar(100), existing.id)
      .input("code", sql.NVarChar(120), childCode)
      .input("name", sql.NVarChar(300), childName)
      .input("is_active", sql.Bit, draft.isActive !== false ? 1 : 0)
      .input(
        "sort_order",
        sql.Int,
        draft.sortOrder ?? existing.sortOrder ?? 0,
      )
      .query(`
        UPDATE core_configuracion.cat_clasificaciones
        SET
          code = @code,
          name = @name,
          hierarchy_level = 2,
          is_active = @is_active,
          sort_order = @sort_order,
          updated_at = SYSUTCDATETIME()
        WHERE classification_id = @classification_id;
      `);

    return { id: existing.id, createdCount: 0 };
  }

  const parentName = normalizeText(draft.parentName) || existing.name;
  const parentCode =
    normalizeCode(draft.parentCode) || normalizeCode(existing.code);

  await req
    .input("classification_id", sql.NVarChar(100), existing.id)
    .input("code", sql.NVarChar(120), parentCode)
    .input("name", sql.NVarChar(300), parentName)
    .input("is_active", sql.Bit, draft.isActive !== false ? 1 : 0)
    .input(
      "sort_order",
      sql.Int,
      draft.sortOrder ?? existing.sortOrder ?? 0,
    )
    .query(`
      UPDATE core_configuracion.cat_clasificaciones
      SET
        code = @code,
        name = @name,
        hierarchy_level = 1,
        is_active = @is_active,
        sort_order = @sort_order,
        updated_at = SYSUTCDATETIME()
      WHERE classification_id = @classification_id;
    `);

  const childName = normalizeText(draft.childName);
  if (!childName) {
    return { id: existing.id, createdCount: 0 };
  }

  const childId = await insertChild(
    tx,
    {
      ...draft,
      categoryId: existing.categoryId,
      childName,
      childCode: draft.childCode || childName,
    },
    existing.id,
  );

  return { id: childId, createdCount: 1 };
}

export async function listClasificacionPairsCrudDorado(filters = {}) {
  const pool = await getAppPool();
  const categoryId = normalizeText(filters.categoryId);
  const onlyActive = Boolean(filters.onlyActive);

  const req = pool.request();
  req.input("category_id", sql.NVarChar(100), categoryId || "");
  req.input("only_active", sql.Bit, onlyActive ? 1 : 0);

  const result = await req.query(`
    SELECT
      COALESCE(c2.classification_id, c1.classification_id) AS row_id,
      c2.parent_classification_id AS parent_id,
      c1.category_id,
      COALESCE(cat.name, cat.code, c1.category_id) AS category_name,
      c1.name AS clasificacion,
      COALESCE(c2.name, '') AS subclasificacion,
      c1.code AS parent_code,
      COALESCE(c2.code, '') AS child_code,
      COALESCE(c2.is_active, c1.is_active, 1) AS is_active,
      CASE
        WHEN c2.classification_id IS NULL THEN c1.sort_order
        ELSE c2.sort_order
      END AS sort_order
    FROM core_configuracion.cat_clasificaciones AS c1
    LEFT JOIN core_configuracion.cat_clasificaciones AS c2
      ON c2.parent_classification_id = c1.classification_id
    LEFT JOIN core_configuracion.cat_categorias AS cat
      ON cat.category_id = c1.category_id
    WHERE c1.parent_classification_id IS NULL
      AND (@category_id = '' OR c1.category_id = @category_id)
      AND (@only_active = 0 OR COALESCE(c2.is_active, c1.is_active, 1) = 1)
    ORDER BY
      UPPER(COALESCE(cat.name, cat.code, c1.category_id)),
      COALESCE(CASE WHEN c2.classification_id IS NULL THEN c1.sort_order ELSE c2.sort_order END, 999999),
      UPPER(c1.name),
      UPPER(COALESCE(c2.name, ''));
  `);

  return (result.recordset || []).map(toPairRow);
}

export async function saveClasificacionCrudDorado(draft) {
  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);

  await tx.begin();

  try {
    if (!draft.id) {
      const parent = await getOrCreateParent(tx, draft);
      const childName = normalizeText(draft.childName);

      if (!childName) {
        await tx.commit();
        return {
          id: parent.id,
          createdCount: parent.created ? 1 : 0,
        };
      }

      const childId = await insertChild(tx, draft, parent.id);
      await tx.commit();
      return {
        id: childId,
        createdCount: (parent.created ? 1 : 0) + 1,
      };
    }

    const existing = await getClasificacionRowById(tx, draft.id);
    if (!existing) {
      throw new Error("Clasificación no encontrada");
    }

    const updated = await updateClasificacion(tx, existing, draft);
    await tx.commit();
    return {
      id: updated.id,
      createdCount: updated.createdCount || 0,
    };
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}

export async function deleteClasificacionCrudDorado(id) {
  const clasificacionId = normalizeText(id);
  if (!clasificacionId) return;

  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const current = await getClasificacionRowById(tx, clasificacionId);
    if (!current) {
      await tx.commit();
      return;
    }

    if (current.parentId) {
      const req = new sql.Request(tx);
      await req
        .input("classification_id", sql.NVarChar(100), clasificacionId)
        .query(`
          UPDATE core_configuracion.cat_clasificaciones
          SET
            is_active = 0,
            updated_at = SYSUTCDATETIME()
          WHERE classification_id = @classification_id;
        `);
      await tx.commit();
      return;
    }

    const req = new sql.Request(tx);
    await req
      .input("parent_id", sql.NVarChar(100), clasificacionId)
      .query(`
        UPDATE core_configuracion.cat_clasificaciones
        SET
          is_active = 0,
          updated_at = SYSUTCDATETIME()
        WHERE classification_id = @parent_id
           OR parent_classification_id = @parent_id;
      `);

    await tx.commit();
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}
