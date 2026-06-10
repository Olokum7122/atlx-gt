import {
  buildReplaceMappingsPlan,
  normalizeHierarchyFilter,
  validateReplaceMappingsDraft,
} from "../../domain/configuracion/componentCatalogContracts.js";
import {
  applyReplaceMappingsPlanCrudDorado,
  deleteComponentCatalogMappingCrudDorado,
  getAreaOptionsCrudDorado,
  getCatalogChecklistForComponentCrudDorado,
  getComponentOptionsCrudDorado,
  getModuleOptionsCrudDorado,
  listComponentCatalogStateCrudDorado,
  listComponentCatalogMappingsCrudDorado,
} from "../../infra/dorado/componentCatalogsCrudDorado.js";

export async function listComponentCatalogMappingsService(filters = {}) {
  const safeFilters = normalizeHierarchyFilter(filters);
  return listComponentCatalogMappingsCrudDorado(safeFilters);
}

export async function getComponentCatalogChecklistService(componentCode) {
  return getCatalogChecklistForComponentCrudDorado(componentCode);
}

export async function replaceComponentCatalogMappingsService(payload) {
  const draft = validateReplaceMappingsDraft(payload);
  const currentRows = await listComponentCatalogStateCrudDorado(draft.componentCode);
  const plan = buildReplaceMappingsPlan(draft, currentRows);
  const result = await applyReplaceMappingsPlanCrudDorado(plan);
  return {
    componentCode: draft.componentCode,
    applied: result.applied,
  };
}

export async function deleteComponentCatalogMappingService(id) {
  return deleteComponentCatalogMappingCrudDorado(id);
}

export async function getModuleOptionsService() {
  return getModuleOptionsCrudDorado();
}

export async function getAreaOptionsService(moduleCode) {
  const safeFilters = normalizeHierarchyFilter({ moduleCode });
  return getAreaOptionsCrudDorado(safeFilters.moduleCode);
}

export async function getComponentOptionsService(moduleCode, areaCode) {
  const safeFilters = normalizeHierarchyFilter({ moduleCode, areaCode });
  return getComponentOptionsCrudDorado(safeFilters.moduleCode, safeFilters.areaCode);
}
