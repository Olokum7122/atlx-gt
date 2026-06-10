import { validateCategoryDraft } from "../../domain/configuracion/categoryContracts.js";
import {
  deleteCategoryCrudDorado,
  listCategoryPairsCrudDorado,
  saveCategoryCrudDorado,
} from "../../infra/dorado/categoriesCrudDorado.js";

export async function listCategoryPairsService(filters = {}) {
  return listCategoryPairsCrudDorado(filters);
}

export async function saveCategoryService(payload) {
  const draft = validateCategoryDraft(payload);
  return saveCategoryCrudDorado(draft);
}

export async function deleteCategoryService(id) {
  return deleteCategoryCrudDorado(id);
}
