import { validateClasificacionDraft } from "../../domain/configuracion/clasificacionContracts.js";
import {
  deleteClasificacionCrudDorado,
  listClasificacionPairsCrudDorado,
  saveClasificacionCrudDorado,
} from "../../infra/dorado/clasificacionesCrudDorado.js";

export async function listClasificacionPairsService(filters = {}) {
  return listClasificacionPairsCrudDorado(filters);
}

export async function saveClasificacionService(payload) {
  const draft = validateClasificacionDraft(payload);
  return saveClasificacionCrudDorado(draft);
}

export async function deleteClasificacionService(id) {
  return deleteClasificacionCrudDorado(id);
}
