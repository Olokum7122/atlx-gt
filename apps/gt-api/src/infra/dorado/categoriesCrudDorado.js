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
    catalogId: String(row.catalog_id || ""),
    catalogName: String(row.catalog_name || ""),
    categoria: String(row.categoria || ""),
    subcategoria: String(row.subcategoria || ""),
    parentCode: String(row.parent_code || ""),
    childCode: String(row.child_code || ""),
    isActive: Number(row.is_active ?? 1) === 1,
    sortOrder:
      row.sort_order === null || row.sort_order === undefined
        ? null
        : Number(row.sort_order),
  };
}

async function getCategoryRowById(txOrPool, id) {
  const categoryId = normalizeText(id);
  if (!categoryId) return null;

  const req = new sql.Request(txOrPool);
  const result = await req
    .input("category_id", sql.NVarChar(100), categoryId)
    .query(`
      SELECT TOP 1
        category_id,
        catalog_id,
        parent_category_id,
        code,
        name,
        hierarchy_level,
        sort_order,
        is_active
      FROM core_configuracion.cat_categorias
      WHERE category_id = @category_id;
    `);

  const row = result.recordset?.[0];
  if (!row) return null;

  return {
    id: String(row.category_id || ""),
    catalogId: String(row.catalog_id || ""),
    parentId: row.parent_category_id ? String(row.parent_category_id) : null,
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
  const catalogId = normalizeText(draft.catalogId);
  const normalizedName = normalizeName(draft.parentName);
  const parentCode = normalizeCode(draft.parentCode);
  const parentName = normalizeText(draft.parentName);
  const isActive = draft.isActive !== false;

  let existing = null;

  if (normalizedName) {
    const byNameReq = new sql.Request(tx);
    const byNameResult = await byNameReq
      .input("catalog_id", sql.NVarChar(100), catalogId)
      .input("normalized_name", sql.NVarChar(300), normalizedName)
      .query(`
        SELECT TOP 1
          category_id,
          code,
          name,
          sort_order,
          is_active
        FROM core_configuracion.cat_categorias
        WHERE catalog_id = @catalog_id
          AND parent_category_id IS NULL
          AND UPPER(name COLLATE Latin1_General_100_CI_AI) = @normalized_name
        ORDER BY updated_at DESC;
      `);

    const row = byNameResult.recordset?.[0];
    if (row) {
      existing = {
        id: String(row.category_id || ""),
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
      .input("catalog_id", sql.NVarChar(100), catalogId)
      .input("code", sql.NVarChar(120), parentCode)
      .query(`
        SELECT TOP 1
          category_id,
          code,
          name,
          sort_order,
          is_active
        FROM core_configuracion.cat_categorias
        WHERE catalog_id = @catalog_id
          AND parent_category_id IS NULL
          AND UPPER(code) = @code
        ORDER BY updated_at DESC;
      `);

    const row = byCodeResult.recordset?.[0];
    if (row) {
      existing = {
        id: String(row.category_id || ""),
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
      .input("category_id", sql.NVarChar(100), existing.id)
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
        UPDATE core_configuracion.cat_categorias
        SET
          code = @code,
          name = @name,
          hierarchy_level = 1,
          is_active = @is_active,
          sort_order = @sort_order,
          updated_at = SYSUTCDATETIME()
        WHERE category_id = @category_id;
      `);

    return {
      id: existing.id,
      created: false,
    };
  }

  const parentId = crypto.randomUUID();
  const insertReq = new sql.Request(tx);
  await insertReq
    .input("category_id", sql.NVarChar(100), parentId)
    .input("catalog_id", sql.NVarChar(100), catalogId)
    .input("code", sql.NVarChar(120), parentCode)
    .input("name", sql.NVarChar(300), parentName)
    .input("is_active", sql.Bit, isActive ? 1 : 0)
    .input("sort_order", sql.Int, draft.sortOrder ?? 0)
    .query(`
      INSERT INTO core_configuracion.cat_categorias (
        category_id,
        catalog_id,
        parent_category_id,
        code,
        name,
        hierarchy_level,
        sort_order,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        @category_id,
        @catalog_id,
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

  return {
    id: parentId,
    created: true,
  };
}

async function insertChild(tx, draft, parentId) {
  const childId = crypto.randomUUID();
  const req = new sql.Request(tx);
  await req
    .input("category_id", sql.NVarChar(100), childId)
    .input("catalog_id", sql.NVarChar(100), normalizeText(draft.catalogId))
    .input("parent_category_id", sql.NVarChar(100), normalizeText(parentId))
    .input("code", sql.NVarChar(120), normalizeCode(draft.childCode))
    .input("name", sql.NVarChar(300), normalizeText(draft.childName))
    .input("is_active", sql.Bit, draft.isActive !== false ? 1 : 0)
    .input("sort_order", sql.Int, draft.sortOrder ?? 0)
    .query(`
      INSERT INTO core_configuracion.cat_categorias (
        category_id,
        catalog_id,
        parent_category_id,
        code,
        name,
        hierarchy_level,
        sort_order,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        @category_id,
        @catalog_id,
        @parent_category_id,
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

async function updateCategory(tx, existing, draft) {
  const req = new sql.Request(tx);

  if (existing.parentId) {
    const childName = normalizeText(draft.childName) || existing.name;
    const childCode = normalizeCode(draft.childCode) || normalizeCode(existing.code);
    await req
      .input("category_id", sql.NVarChar(100), existing.id)
      .input("code", sql.NVarChar(120), childCode)
      .input("name", sql.NVarChar(300), childName)
      .input("is_active", sql.Bit, draft.isActive !== false ? 1 : 0)
      .input("sort_order", sql.Int, draft.sortOrder ?? existing.sortOrder ?? 0)
      .query(`
        UPDATE core_configuracion.cat_categorias
        SET
          code = @code,
          name = @name,
          hierarchy_level = 2,
          is_active = @is_active,
          sort_order = @sort_order,
          updated_at = SYSUTCDATETIME()
        WHERE category_id = @category_id;
      `);

    return {
      id: existing.id,
      createdCount: 0,
    };
  }

  const parentName = normalizeText(draft.parentName) || existing.name;
  const parentCode = normalizeCode(draft.parentCode) || normalizeCode(existing.code);

  await req
    .input("category_id", sql.NVarChar(100), existing.id)
    .input("code", sql.NVarChar(120), parentCode)
    .input("name", sql.NVarChar(300), parentName)
    .input("is_active", sql.Bit, draft.isActive !== false ? 1 : 0)
    .input("sort_order", sql.Int, draft.sortOrder ?? existing.sortOrder ?? 0)
    .query(`
      UPDATE core_configuracion.cat_categorias
      SET
        code = @code,
        name = @name,
        hierarchy_level = 1,
        is_active = @is_active,
        sort_order = @sort_order,
        updated_at = SYSUTCDATETIME()
      WHERE category_id = @category_id;
    `);

  const childName = normalizeText(draft.childName);
  if (!childName) {
    return {
      id: existing.id,
      createdCount: 0,
    };
  }

  const childId = await insertChild(tx, {
    ...draft,
    catalogId: existing.catalogId,
    childName,
    childCode: draft.childCode || childName,
  }, existing.id);

  return {
    id: childId,
    createdCount: 1,
  };
}

export async function listCategoryPairsCrudDorado(filters = {}) {
  const pool = await getAppPool();
  const catalogId = normalizeText(filters.catalogId);
  const onlyActive = Boolean(filters.onlyActive);

  const req = pool.request();
  req.input("catalog_id", sql.NVarChar(100), catalogId || "");
  req.input("only_active", sql.Bit, onlyActive ? 1 : 0);

  const result = await req.query(`
    SELECT
      COALESCE(c2.category_id, c1.category_id) AS row_id,
      c2.parent_category_id AS parent_id,
      c1.catalog_id,
      COALESCE(cat.name, cat.code, c1.catalog_id) AS catalog_name,
      c1.name AS categoria,
      COALESCE(c2.name, '') AS subcategoria,
      c1.code AS parent_code,
      COALESCE(c2.code, '') AS child_code,
      COALESCE(c2.is_active, c1.is_active, 1) AS is_active,
      CASE
        WHEN c2.category_id IS NULL THEN c1.sort_order
        ELSE c2.sort_order
      END AS sort_order
    FROM core_configuracion.cat_categorias AS c1
    LEFT JOIN core_configuracion.cat_categorias AS c2
      ON c2.parent_category_id = c1.category_id
     AND c2.catalog_id = c1.catalog_id
    LEFT JOIN core_configuracion.cat_catalogos AS cat
      ON cat.catalog_id = c1.catalog_id
    WHERE c1.parent_category_id IS NULL
      AND (@catalog_id = '' OR c1.catalog_id = @catalog_id)
      AND (@only_active = 0 OR COALESCE(c2.is_active, c1.is_active, 1) = 1)
    ORDER BY
      UPPER(COALESCE(cat.name, cat.code, c1.catalog_id)),
      COALESCE(CASE WHEN c2.category_id IS NULL THEN c1.sort_order ELSE c2.sort_order END, 999999),
      UPPER(c1.name),
      UPPER(COALESCE(c2.name, ''));
  `);

  return (result.recordset || []).map(toPairRow);
}

export async function saveCategoryCrudDorado(draft) {
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

    const existing = await getCategoryRowById(tx, draft.id);
    if (!existing) {
      throw new Error("Categoría no encontrada");
    }

    const updated = await updateCategory(tx, existing, draft);
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

export async function deleteCategoryCrudDorado(id) {
  const categoryId = normalizeText(id);
  if (!categoryId) return;

  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const current = await getCategoryRowById(tx, categoryId);
    if (!current) {
      await tx.commit();
      return;
    }

    if (current.parentId) {
      const req = new sql.Request(tx);
      await req
        .input("category_id", sql.NVarChar(100), categoryId)
        .query(`
          UPDATE core_configuracion.cat_categorias
          SET
            is_active = 0,
            updated_at = SYSUTCDATETIME()
          WHERE category_id = @category_id;
        `);
      await tx.commit();
      return;
    }

    const req = new sql.Request(tx);
    await req
      .input("parent_id", sql.NVarChar(100), categoryId)
      .query(`
        UPDATE core_configuracion.cat_categorias
        SET
          is_active = 0,
          updated_at = SYSUTCDATETIME()
        WHERE category_id = @parent_id
           OR parent_category_id = @parent_id;
      `);

    await tx.commit();
  } catch (error) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    throw error;
  }
}
