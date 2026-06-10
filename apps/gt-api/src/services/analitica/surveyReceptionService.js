import {
  getSurveyReceptionExecutableDetailCrudDorado,
  getSurveyReceptionOverviewCrudDorado,
  listSurveyReceptionByExecutableCrudDorado,
} from "../../infra/dorado/surveyReceptionCrudDorado.js";

export async function getSurveyReceptionOverviewService(limit) {
  return getSurveyReceptionOverviewCrudDorado(limit);
}

export async function listSurveyReceptionByExecutableService(limit) {
  return listSurveyReceptionByExecutableCrudDorado(limit);
}

export async function getSurveyReceptionExecutableDetailService(executableId) {
  return getSurveyReceptionExecutableDetailCrudDorado(executableId);
}