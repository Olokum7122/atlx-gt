function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "_");
}

function uniqueCodes(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => normalizeCode(item))
        .filter(Boolean),
    ),
  );
}

export function validateReplaceMappingsDraft(input = {}) {
  const componentCode = normalizeCode(input.componentCode);
  if (!componentCode) {
    throw new Error("Código de componente es requerido");
  }

  return {
    componentCode,
    catalogCodes: uniqueCodes(input.catalogCodes),
  };
}

export function normalizeHierarchyFilter(input = {}) {
  return {
    moduleCode: normalizeCode(input.moduleCode),
    areaCode: normalizeCode(input.areaCode),
    componentCode: normalizeCode(input.componentCode),
  };
}

export function buildReplaceMappingsPlan(draft, currentRows = []) {
  const byCatalog = new Map();
  for (const row of Array.isArray(currentRows) ? currentRows : []) {
    const catalogCode = normalizeCode(row?.catalogCode);
    if (!catalogCode) continue;
    byCatalog.set(catalogCode, {
      id: normalizeText(row?.id),
      isActive: Boolean(row?.isActive),
    });
  }

  const toReactivate = [];
  const toInsert = [];

  for (const catalogCode of draft.catalogCodes) {
    const existing = byCatalog.get(catalogCode);
    if (existing?.id) {
      toReactivate.push(existing.id);
    } else {
      toInsert.push(catalogCode);
    }
  }

  const requestedSet = new Set(draft.catalogCodes);
  const toDeactivate = [];
  for (const [catalogCode, info] of byCatalog.entries()) {
    if (info.isActive && !requestedSet.has(catalogCode)) {
      toDeactivate.push(catalogCode);
    }
  }

  return {
    componentCode: draft.componentCode,
    toReactivate,
    toInsert,
    toDeactivate,
    applied: draft.catalogCodes.length,
  };
}
