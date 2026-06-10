import { validateSurveyResponseProfileDraft } from "../../domain/analitica/surveyResponseProfileContracts.js";
import {
  deleteSurveyResponseProfileCrudDorado,
  getSurveyResponseProfileByIdCrudDorado,
  listSurveyResponseProfilesCrudDorado,
  saveSurveyResponseProfileCrudDorado,
} from "../../infra/dorado/surveyResponseProfilesCrudDorado.js";

export async function listSurveyResponseProfilesService({ includeInactive, sectionType }) {
  return listSurveyResponseProfilesCrudDorado({ includeInactive, sectionType });
}

export async function getSurveyResponseProfileByIdService(id) {
  return getSurveyResponseProfileByIdCrudDorado(id);
}

export async function saveSurveyResponseProfileService(payload) {
  const draft = validateSurveyResponseProfileDraft(payload);
  return saveSurveyResponseProfileCrudDorado(draft);
}

export async function deleteSurveyResponseProfileService(id) {
  return deleteSurveyResponseProfileCrudDorado(id);
}