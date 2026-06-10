function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUpperCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "_");
}

function normalizeOption(input = {}, index = 0) {
  return {
    optionLabel: normalizeText(input.optionLabel || input.label),
    optionValue: normalizeText(input.optionValue || input.value || input.optionLabel || input.label),
    optionOrder: Number(input.optionOrder ?? input.order ?? index + 1) || index + 1,
    weight: input.weight == null || input.weight === "" ? null : Number(input.weight),
  };
}

function normalizeConfig(input = {}) {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const clean = { ...input };
  if (clean.profileType != null) {
    clean.profileType = normalizeText(clean.profileType);
  }
  if (clean.description != null) {
    clean.description = normalizeText(clean.description);
  }
  return clean;
}

export function normalizeSurveyResponseProfileDraft(input = {}) {
  const options = Array.isArray(input.options)
    ? input.options.map((item, index) => normalizeOption(item, index)).filter((item) => item.optionLabel)
    : [];

  return {
    id: normalizeText(input.id) || null,
    code: normalizeUpperCode(input.code),
    label: normalizeText(input.label),
    sectionType: normalizeText(input.sectionType).toLowerCase(),
    inputType: normalizeText(input.inputType).toLowerCase(),
    isActive: input.isActive !== false,
    createdBy: normalizeText(input.createdBy || input.actorId || "system"),
    config: normalizeConfig(input.config),
    options,
  };
}

export function validateSurveyResponseProfileDraft(input = {}) {
  const draft = normalizeSurveyResponseProfileDraft(input);

  if (!draft.code) {
    throw new Error("Código de perfil es requerido");
  }
  if (!draft.label) {
    throw new Error("Etiqueta de perfil es requerida");
  }
  if (!draft.sectionType) {
    throw new Error("Tipo de sección es requerido");
  }
  if (!draft.inputType) {
    throw new Error("Tipo de input es requerido");
  }

  if (["multi_select", "single_choice", "multi_choice", "single_select"].includes(draft.inputType) && draft.options.length < 2) {
    throw new Error("Perfiles de selección requieren al menos 2 opciones");
  }

  return draft;
}