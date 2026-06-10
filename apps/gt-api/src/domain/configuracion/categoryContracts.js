function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "_");
}

function normalizeSortOrder(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error("Orden debe ser un número entero");
  }
  return parsed;
}

export function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

export function normalizeCategoryDraft(input = {}) {
  const parentName = normalizeText(input.parentName);
  const childName = normalizeText(input.childName);

  return {
    id: normalizeText(input.id) || null,
    catalogId: normalizeText(input.catalogId),
    parentId: normalizeText(input.parentId) || null,
    parentCode: normalizeCode(input.parentCode) || slug(parentName),
    parentName,
    childCode: normalizeCode(input.childCode) || slug(childName),
    childName,
    sortOrder: normalizeSortOrder(input.sortOrder),
    isActive: input.isActive !== false,
  };
}

export function validateCategoryDraft(input = {}) {
  const draft = normalizeCategoryDraft(input);

  if (!draft.catalogId) {
    throw new Error("Catálogo es requerido");
  }

  if (!draft.id && !draft.parentName) {
    throw new Error("Nombre categoría es requerido");
  }

  if (!draft.id && !draft.parentCode && draft.parentName) {
    draft.parentCode = slug(draft.parentName);
  }

  if (!draft.childCode && draft.childName) {
    draft.childCode = slug(draft.childName);
  }

  return draft;
}
