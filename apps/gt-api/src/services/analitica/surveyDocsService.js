import { validateSurveyDocDraft } from "../../domain/analitica/surveyDocContracts.js";
import {
  deleteSurveyDocCrudDorado,
  getSurveyDocByIdCrudDorado,
  listSurveyDocsCrudDorado,
  saveSurveyDocCrudDorado,
} from "../../infra/dorado/surveyDocsCrudDorado.js";
import {
  assignSurveyToDeviceCrudDorado,
  generateSurveyPublicUrlCrudDorado,
  listSurveyAdminQueueCrudDorado,
  listSurveyAdminTransitionsByDocCrudDorado,
  listSurveyDeviceTargetsCrudDorado,
  listSurveyProductionControlCrudDorado,
  loadCollectForSurveyCrudDorado,
  publishSurveyDocCrudDorado,
  registerSurveyAdminTransitionCrudDorado,
} from "../../infra/dorado/surveyPublicationCrudDorado.js";
import {
  approveCollectorDeviceActivationService as approveCollectorDeviceActivationFromSyncService,
  cancelCollectorDeviceActivationService as cancelCollectorDeviceActivationFromSyncService,
  listCollectorDeviceActivationRequestsService as listCollectorDeviceActivationRequestsFromSyncService,
  revokeCollectorRegisteredDeviceService as revokeCollectorRegisteredDeviceFromSyncService,
} from "../syncService.js";

export async function listSurveyDocsService() {
  return listSurveyDocsCrudDorado();
}

export async function getSurveyDocByIdService(id) {
  return getSurveyDocByIdCrudDorado(id);
}

export async function saveSurveyDocService(payload) {
  const draft = validateSurveyDocDraft(payload);
  return saveSurveyDocCrudDorado(draft);
}

export async function deleteSurveyDocService(id) {
  return deleteSurveyDocCrudDorado(id);
}

export async function publishSurveyDocService({ docId, publishedBy, channelCode, requestContext }) {
  return publishSurveyDocCrudDorado({ docId, publishedBy, channelCode, requestContext });
}

export async function generateSurveyPublicUrlService(docId) {
  return generateSurveyPublicUrlCrudDorado(docId);
}

export async function listSurveyDeviceTargetsService(channelCode) {
  return listSurveyDeviceTargetsCrudDorado(channelCode);
}

export async function loadCollectForSurveyService({ docId, device, requestContext }) {
  return loadCollectForSurveyCrudDorado({ docId, device, requestContext });
}

export async function assignSurveyToDeviceService({ docId, device, requestContext }) {
  return assignSurveyToDeviceCrudDorado({ docId, device, requestContext });
}

export async function registerSurveyAdminTransitionService({
  docId,
  executableId,
  actionCode,
  transitionNote,
  requestContext,
}) {
  return registerSurveyAdminTransitionCrudDorado({
    docId,
    executableId,
    actionCode,
    transitionNote,
    requestContext,
  });
}

export async function listSurveyAdminQueueService(limit) {
  return listSurveyAdminQueueCrudDorado(limit);
}

export async function listSurveyAdminTransitionsByDocService(docId, limit) {
  return listSurveyAdminTransitionsByDocCrudDorado(docId, limit);
}

export async function listSurveyProductionControlService(limit) {
  return listSurveyProductionControlCrudDorado(limit);
}

export async function listCollectorDeviceActivationRequestsService(statusCode) {
  return listCollectorDeviceActivationRequestsFromSyncService(statusCode);
}

export async function approveCollectorDeviceActivationService(payload) {
  return approveCollectorDeviceActivationFromSyncService(payload);
}

export async function cancelCollectorDeviceActivationService(payload) {
  return cancelCollectorDeviceActivationFromSyncService(payload);
}

export async function revokeCollectorRegisteredDeviceService(payload) {
  return revokeCollectorRegisteredDeviceFromSyncService(payload);
}

export async function executeSurveyDeviceDeploymentService({
  docId,
  device,
  requestContext,
}) {
  const transition = await registerSurveyAdminTransitionCrudDorado({
    docId,
    actionCode: "authorize_device",
    transitionNote: "Despliegue operativo a dispositivo ejecutado desde Administracion y Control",
    requestContext,
  });

  const resolvedChannelCode = (device?.channelCode || "device").toLowerCase();
  const publication = await publishSurveyDocCrudDorado({
    docId,
    publishedBy: normalizeActorId(requestContext),
    channelCode: resolvedChannelCode,
    requestContext,
  });

  const loadCollect = await loadCollectForSurveyCrudDorado({
    docId,
    device,
    requestContext,
  });

  const assignment = await assignSurveyToDeviceCrudDorado({
    docId,
    device,
    requestContext,
  });

  return {
    docId: Number(docId),
    executableCode:
      publication?.executableCode ||
      assignment?.executableCode ||
      loadCollect?.executableCode ||
      "",
    publication,
    transition: transition || null,
    loadCollect,
    assignment,
  };
}

export async function executeSurveyWebDeploymentService({ docId, requestContext }) {
  const transition = await registerSurveyAdminTransitionCrudDorado({
    docId,
    actionCode: "authorize_web",
    transitionNote: "Despliegue operativo web ejecutado desde Administracion y Control",
    requestContext,
  });

  const publication = await publishSurveyDocCrudDorado({
    docId,
    publishedBy: normalizeActorId(requestContext),
    channelCode: "web",
    requestContext,
  });

  const publicUrl = await generateSurveyPublicUrlCrudDorado(docId);

  return {
    docId: Number(docId),
    executableCode: publication?.executableCode || publicUrl?.executableCode || "",
    publication,
    transition: transition || null,
    publicUrl,
  };
}

function normalizeActorId(requestContext = {}) {
  return String(requestContext?.actorId || "survey-admin").trim() || "survey-admin";
}