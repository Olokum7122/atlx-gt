function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUpperCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "_");
}

function normalizeSectionType(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeDocItem(input = {}, index = 0) {
  return {
    id: normalizeText(input.id) || null,
    lineOrder: Number(input.lineOrder ?? input.line_order ?? index + 1) || index + 1,
    sectionType: normalizeSectionType(input.sectionType || input.section_type),
    questionText: normalizeText(input.questionText || input.question_text),
    responseInputCode: normalizeUpperCode(
      input.responseInputCode || input.response_profile_code || input.code,
    ),
  };
}

export function normalizeSurveyDocDraft(input = {}) {
  const items = Array.isArray(input.items)
    ? input.items
        .map((item, index) => normalizeDocItem(item, index))
        .filter((item) => item.questionText && item.responseInputCode)
    : [];

  return {
    id: input.id == null || input.id === "" ? null : Number(input.id),
    docCode: normalizeUpperCode(input.docCode || input.doc_code),
    name: normalizeText(input.name || input.docName || input.doc_name),
    objective: normalizeText(input.objective),
    audience: normalizeText(input.audience),
    statusCode: normalizeText(input.statusCode || input.status_code).toLowerCase() || "draft",
    isActive: input.isActive !== false,
    items,
  };
}

export function validateSurveyDocDraft(input = {}) {
  const draft = normalizeSurveyDocDraft(input);

  if (draft.id != null && (!Number.isFinite(draft.id) || draft.id <= 0)) {
    throw new Error("Identificador de encuesta inválido");
  }
  if (!draft.name) {
    throw new Error("Nombre de encuesta es requerido");
  }

  for (const item of draft.items) {
    if (!item.sectionType) {
      throw new Error("Cada reactivo requiere tipo de sección");
    }
    if (!item.questionText) {
      throw new Error("Cada reactivo requiere texto de pregunta");
    }
    if (!item.responseInputCode) {
      throw new Error("Cada reactivo requiere responseInputCode");
    }
  }

  return draft;
}