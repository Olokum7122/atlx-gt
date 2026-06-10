import {
  getPublicSurveyExecutableCrudDorado,
  pullAssignedSurveysCrudDorado,
  pushSubmissionCrudDorado,
} from "../infra/dorado/syncCrudDorado.js";
import {
  approveCollectorDeviceActivationCrudDorado,
  cancelCollectorDeviceActivationCrudDorado,
  getCollectorDeviceActivationStatusCrudDorado,
  listCollectorDeviceActivationRequestsCrudDorado,
  revokeCollectorRegisteredDeviceCrudDorado,
  requestCollectorDeviceActivationCrudDorado,
} from "../infra/dorado/surveyDeviceActivationCrudDorado.js";

export async function pullAssignedSurveysService(deviceId) {
  return pullAssignedSurveysCrudDorado(deviceId);
}

export async function getPublicSurveyExecutableService(executableCode) {
  return getPublicSurveyExecutableCrudDorado(executableCode);
}

export async function pushSubmissionService(payload) {
  return pushSubmissionCrudDorado(payload);
}

export async function requestCollectorDeviceActivationService(payload) {
  return requestCollectorDeviceActivationCrudDorado(payload);
}

export async function getCollectorDeviceActivationStatusService(deviceUuid) {
  return getCollectorDeviceActivationStatusCrudDorado(deviceUuid);
}

export async function listCollectorDeviceActivationRequestsService(statusCode) {
  return listCollectorDeviceActivationRequestsCrudDorado(statusCode);
}

export async function approveCollectorDeviceActivationService(payload) {
  return approveCollectorDeviceActivationCrudDorado(payload);
}

export async function cancelCollectorDeviceActivationService(payload) {
  return cancelCollectorDeviceActivationCrudDorado(payload);
}

export async function revokeCollectorRegisteredDeviceService(payload) {
  return revokeCollectorRegisteredDeviceCrudDorado(payload);
}
