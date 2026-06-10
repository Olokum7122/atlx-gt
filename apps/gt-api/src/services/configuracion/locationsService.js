import { validateLocationDraft } from "../../domain/configuracion/locationContracts.js";
import {
  bulkSetLocationNodesActiveCrudDorado,
  deactivateLocationCrudDorado,
  getLocationByIdCrudDorado,
  listLocationCascadeComponentsCrudDorado,
  listLocationsCrudDorado,
  purgeLocationCascadeCrudDorado,
  saveLocationAggregateCrudDorado,
} from "../../infra/dorado/locationsCrudDorado.js";

export async function listLocationsService({ includeInactive }) {
  return listLocationsCrudDorado({ includeInactive });
}

export async function getLocationByIdService(id) {
  return getLocationByIdCrudDorado(id);
}

export async function saveLocationAggregateService(payload) {
  const draft = validateLocationDraft(payload);
  return saveLocationAggregateCrudDorado(draft);
}

export async function rebuildLocationCascadeService(id) {
  const current = await getLocationByIdCrudDorado(id);
  if (!current) return null;

  return saveLocationAggregateCrudDorado({
    id: current.id,
    tenantId: current.tenantId,
    code: current.code,
    name: current.name,
    isActive: current.isActive,
    moduleCodes: [],
  });
}

export async function purgeLocationCascadeService(id) {
  return purgeLocationCascadeCrudDorado(id);
}

export async function deleteLocationService(id) {
  return deactivateLocationCrudDorado(id);
}

export async function listLocationCascadeComponentsService({
  instanceId,
  moduleCode,
  areaCodes,
  includeInactive,
}) {
  return listLocationCascadeComponentsCrudDorado({
    instanceId,
    moduleCode,
    areaCodes,
    includeInactive,
  });
}

export async function bulkSetLocationVisibilityService({
  instanceId,
  locationIds,
  isActive,
}) {
  return bulkSetLocationNodesActiveCrudDorado({
    instanceId,
    locationIds,
    isActive,
  });
}
