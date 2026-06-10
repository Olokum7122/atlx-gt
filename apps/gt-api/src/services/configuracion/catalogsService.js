import {
  validateCatalogDraft,
  validateRuleStates,
} from "../../domain/configuracion/catalogContracts.js";
import {
  applyCatalogRulesCrudDorado,
  deleteCatalogCrudDorado,
  getCatalogByIdCrudDorado,
  getCatalogRuleChecklistCrudDorado,
  getModuleTabsCrudDorado,
  listCatalogsCrudDorado,
  saveCatalogCrudDorado,
} from "../../infra/dorado/catalogsCrudDorado.js";

export async function listCatalogsService({ includeInactive }) {
  return listCatalogsCrudDorado({ includeInactive });
}

export async function getCatalogByIdService(id) {
  return getCatalogByIdCrudDorado(id);
}

export async function saveCatalogService(payload) {
  const draft = validateCatalogDraft(payload);
  return saveCatalogCrudDorado(draft);
}

export async function deleteCatalogService(id) {
  return deleteCatalogCrudDorado(id);
}

export async function getCatalogRuleChecklistService(catalogId, moduleFilter) {
  return getCatalogRuleChecklistCrudDorado(catalogId, moduleFilter);
}

export async function applyCatalogRulesService(catalogId, ruleStates) {
  const safeStates = validateRuleStates(ruleStates);
  return applyCatalogRulesCrudDorado(catalogId, safeStates);
}

export async function getModuleTabsService() {
  return getModuleTabsCrudDorado();
}
