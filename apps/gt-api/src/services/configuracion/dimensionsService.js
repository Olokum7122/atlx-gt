import {
  activateDimensionsCrudDorado,
  approveDimensionsCrudDorado,
  listDimensionsCrudDorado,
  purgeAllDimensionsCrudDorado,
  removeDimensionsCrudDorado,
  updateDimensionCrudDorado,
} from "../../infra/dorado/dimensionsCrudDorado.js";
import { rematerializeActiveLocationInstancesCrudDorado } from "../../infra/dorado/locationsCrudDorado.js";

export async function listDimensionsService({ includeInactive }) {
  return listDimensionsCrudDorado({ includeInactive });
}

export async function approveDimensionsService(rows) {
  await approveDimensionsCrudDorado(rows);
  const sync = await rematerializeActiveLocationInstancesCrudDorado();
  return { approved: rows.length, rematerialized: sync.rematerialized };
}

export async function updateDimensionService(payload) {
  const result = await updateDimensionCrudDorado(payload);
  if (!result?.found) return result;
  const sync = await rematerializeActiveLocationInstancesCrudDorado();
  return { ...result, rematerialized: sync.rematerialized };
}

export async function removeDimensionsService(dimCodes) {
  const removed = await removeDimensionsCrudDorado(dimCodes);
  const sync = await rematerializeActiveLocationInstancesCrudDorado();
  return { removed, rematerialized: sync.rematerialized };
}

export async function activateDimensionsService(dimCodes) {
  const activated = await activateDimensionsCrudDorado(dimCodes);
  const sync = await rematerializeActiveLocationInstancesCrudDorado();
  return { activated, rematerialized: sync.rematerialized };
}

export async function purgeAllDimensionsService() {
  const purged = await purgeAllDimensionsCrudDorado();
  const sync = await rematerializeActiveLocationInstancesCrudDorado();
  return { purged, rematerialized: sync.rematerialized };
}
