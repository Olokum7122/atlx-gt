import { Router } from "express";
import { z } from "zod";
import https from "node:https";
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { getPublicSurveyExecutableService, pushSubmissionService } from "../services/syncService.js";

// ── Self-hosted URL shortener ──
const __dir = dirname(fileURLToPath(import.meta.url));
const SHORT_LINKS_PATH = join(__dir, "../../data/short_links.json");

function loadShortLinks() {
  try {
    if (!existsSync(SHORT_LINKS_PATH)) return {};
    return JSON.parse(readFileSync(SHORT_LINKS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveShortLinks(map) {
  try {
    mkdirSync(dirname(SHORT_LINKS_PATH), { recursive: true });
    writeFileSync(SHORT_LINKS_PATH, JSON.stringify(map, null, 2), "utf8");
  } catch { /* non-fatal */ }
}

const shortLinks = loadShortLinks();

function generateShortCode() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let code;
  do {
    code = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (shortLinks[code]);
  return code;
}

function normalizeForwardedHeader(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .find(Boolean) || "";
}

function getServerBase(req) {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl;
  }

  const forwardedProto = normalizeForwardedHeader(req.headers["x-forwarded-proto"]);
  const forwardedHost = normalizeForwardedHeader(req.headers["x-forwarded-host"]);
  const protocol = forwardedProto || req.protocol || "http";
  const host = forwardedHost || req.headers.host || req.get("host") || "";
  return `${protocol}://${host}`.replace(/\/+$/g, "");
}

const router = Router();

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeJsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function resolveAnswerKind(line) {
  const sectionType = String(line?.sectionType || "").toLowerCase();
  const inputType = String(line?.inputType || "").toLowerCase();
  const selectionMode = String(line?.selectionMode || "").toLowerCase();

  if (sectionType === "likert") return "likert";
  if (sectionType === "unica") return "choice_single";
  if (inputType.includes("single_choice")) return "choice_single";
  if (sectionType === "multi") return "choice_multi";
  if (inputType.includes("multi_choice") || selectionMode === "multiple") return "choice_multi";
  if (sectionType === "rango") return "rango";
  if (
    sectionType === "numerico" ||
    inputType.includes("numeric") ||
    inputType.includes("decimal") ||
    inputType.includes("integer") ||
    line?.numericKind
  ) {
    return "numeric";
  }
  return "text";
}

function extractRangeLabel(questionText) {
  const raw = String(questionText || "");
  const colonIdx = raw.indexOf(":");
  if (colonIdx > 0) return raw.slice(0, colonIdx).trim();
  return raw;
}

function extractRangeScale(questionText) {
  const raw = String(questionText || "");
  const match = raw.match(/usando (.+)/i);
  return match ? match[1].trim().replace(/\.$/, "") : "";
}

function renderQuestion(line, index) {
  const inputName = `q_${line.executableLineId || index + 1}`;
  const answerKind = resolveAnswerKind(line);

  if (["likert", "choice_single", "choice_multi"].includes(answerKind) && Array.isArray(line.options) && line.options.length) {
    const inputType = answerKind === "choice_multi" && line.selectionMode === "multiple" ? "checkbox" : "radio";
    const optionsHtml = line.options
      .map(
        (option) => `
          <label class="option-item">
            <input type="${inputType}" name="${escapeHtml(inputName)}" value="${escapeHtml(answerKind === "likert" ? option.optionOrder : option.optionValue || option.optionLabel)}" />
            <span>${escapeHtml(option.optionLabel || option.optionValue)}</span>
          </label>`,
      )
      .join("");
    return `<div class="option-list">${optionsHtml}</div>`;
  }

  if (answerKind === "rango") {
    const attrLabel = extractRangeLabel(line.questionText);
    const scale = extractRangeScale(line.questionText);
    const scaleHint = scale ? `<div class="range-scale-hint">${escapeHtml(scale)}</div>` : "";
    const minBound = line.minValue != null ? Number(line.minValue) : 1;
    const maxBound = line.maxValue != null ? Number(line.maxValue) : 10;
    return `
      ${scaleHint}
      <div class="range-grid">
        <label class="range-field">
          <span class="range-label">Mínimo — ${escapeHtml(attrLabel)}</span>
          <input class="survey-input" type="number" name="${escapeHtml(inputName)}_min"
            min="${minBound}" max="${maxBound}" step="1" placeholder="${minBound}" />
        </label>
        <label class="range-field">
          <span class="range-label">Máximo — ${escapeHtml(attrLabel)}</span>
          <input class="survey-input" type="number" name="${escapeHtml(inputName)}_max"
            min="${minBound}" max="${maxBound}" step="1" placeholder="${maxBound}" />
        </label>
      </div>`;
  }

  if (answerKind === "numeric") {
    return `
      <input
        class="survey-input"
        type="number"
        name="${escapeHtml(inputName)}"
        placeholder="Captura tu respuesta"
        ${line.minValue != null ? `min="${Number(line.minValue)}"` : ""}
        ${line.maxValue != null ? `max="${Number(line.maxValue)}"` : ""}
        ${line.precisionDigits === 0 ? 'step="1"' : 'step="0.01"'}
      />`;
  }

  return `
    <textarea
      class="survey-input survey-textarea"
      name="${escapeHtml(inputName)}"
      rows="3"
      placeholder="Escribe tu respuesta"
    ></textarea>`;
}

function renderProfileCard() {
  return `
    <section class="question-card profile-card">
      <div class="question-order">P</div>
      <div class="question-body">
        <div class="question-text">Identificación mínima del respondente</div>
        <div class="profile-grid">
          <label class="field-block">
            <span>Referencia</span>
            <input class="survey-input" type="text" name="respondentRef" placeholder="Nombre corto, WhatsApp o folio" />
          </label>
          <label class="field-block">
            <span>Nombre</span>
            <input class="survey-input" type="text" name="respondentName" placeholder="Tu nombre" />
          </label>
          <label class="field-block field-wide">
            <span>Negocio</span>
            <input class="survey-input" type="text" name="businessName" placeholder="Negocio o razón social" />
          </label>
        </div>
        <label class="consent-box">
          <input type="checkbox" name="consentGiven" value="1" />
          <span>Autorizo el uso de mis respuestas para operación y analítica de ATLX GT.</span>
        </label>
      </div>
    </section>`;
}

function renderSurveyPage(payload) {
  const lines = payload.lines || [];
  const payloadJson = escapeJsonForScript(payload);
  const totalSteps = 1 + lines.length; // step 0 = perfil, steps 1..N = preguntas

  const profileStepHtml = `
    <div class="step active" id="step-0">
      <div class="step-section-label">Perfil del respondente</div>
      ${renderProfileCard()}
    </div>`;

  const questionStepsHtml = lines
    .map((line, index) => {
      const stepNum = index + 1;
      const kind = resolveAnswerKind(line);
      const displayText =
        kind === "rango"
          ? extractRangeLabel(line.questionText)
          : line.questionText;
      const sectionType = String(line.sectionType || "-");
      const inputType = String(line.inputType || "");
      const badgeText =
        escapeHtml(sectionType) +
        (inputType && inputType !== sectionType ? " \xb7 " + escapeHtml(inputType) : "");
      return `
    <div class="step" id="step-${stepNum}">
      <div class="step-section-label">
        <span class="step-q-counter">Pregunta ${stepNum}&nbsp;/&nbsp;${lines.length}</span>
        <span class="type-badge">${badgeText}</span>
      </div>
      <section class="question-card">
        <div class="question-order">${stepNum}</div>
        <div class="question-body">
          <div class="question-text">${escapeHtml(displayText)}</div>
          ${renderQuestion(line, index)}
        </div>
      </section>
    </div>`;
    })
    .join("");

  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(payload.docName || payload.docCode || "Encuesta ATLX GT")}</title>
      <style>
        :root {
          --bg: #f6f2ea;
          --panel: #fffdfa;
          --ink: #41281b;
          --brand: #b45309;
          --line: #ead9c7;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Segoe UI", Tahoma, sans-serif;
          background: linear-gradient(180deg, #f4ede4 0%, #fbf8f3 100%);
          color: var(--ink);
        }
        .shell {
          max-width: 880px;
          margin: 0 auto;
          padding: 24px 16px 48px;
        }
        .hero {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 8px 30px rgba(65, 40, 27, 0.06);
          margin-bottom: 14px;
        }
        .eyebrow {
          font-size: 12px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: #8a5a34;
          margin-bottom: 8px;
        }
        h1 {
          margin: 0 0 10px;
          font-size: 28px;
          line-height: 1.1;
        }
        .meta, .objective {
          color: #6b4d36;
          font-size: 14px;
          line-height: 1.6;
        }
        /* ── step indicator ── */
        .step-indicator {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 12px 18px;
          margin-bottom: 12px;
        }
        .step-counter {
          font-size: 13px;
          font-weight: 700;
          color: var(--brand);
          letter-spacing: .06em;
          margin-bottom: 8px;
        }
        .progress-bar {
          height: 6px;
          background: var(--line);
          border-radius: 99px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--brand);
          border-radius: 99px;
          transition: width 0.3s ease;
        }
        /* ── steps ── */
        .step { display: none; }
        .step.active { display: block; }
        .step-section-label {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
          font-size: 13px;
          color: #8a5a34;
          font-weight: 600;
        }
        .step-q-counter {
          font-size: 14px;
          font-weight: 700;
          color: var(--ink);
        }
        .type-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 10px;
          background: #dbeafe;
          color: #1d4ed8;
          border-radius: 99px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
        /* ── question card ── */
        .question-card {
          display: grid;
          grid-template-columns: 44px 1fr;
          gap: 14px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 18px;
          margin-top: 8px;
        }
        .question-order {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          background: #f9e6c8;
          color: var(--brand);
          display: grid;
          place-items: center;
          font-weight: 700;
        }
        .question-text {
          font-size: 17px;
          font-weight: 600;
          margin-bottom: 12px;
        }
        .option-list {
          display: grid;
          gap: 10px;
        }
        .option-item {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 12px 14px;
          border: 1px solid var(--line);
          border-radius: 14px;
          background: #fff;
        }
        .survey-input {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 12px 14px;
          font: inherit;
          background: #fff;
        }
        .survey-textarea {
          min-height: 110px;
          resize: vertical;
        }
        .notice {
          margin-top: 18px;
          background: #fff7ed;
          border: 1px solid #fdba74;
          color: #9a3412;
          border-radius: 16px;
          padding: 14px 16px;
          font-size: 14px;
        }
        .profile-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .field-block {
          display: grid;
          gap: 6px;
          font-size: 14px;
          color: #6b4d36;
        }
        .field-wide {
          grid-column: 1 / -1;
        }
        .consent-box {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-top: 16px;
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 14px;
          background: #fffaf4;
        }
        .range-scale-hint {
          font-size: 12px;
          color: #9c7150;
          margin-bottom: 10px;
          padding: 6px 10px;
          background: #fdf4e7;
          border-left: 3px solid var(--brand);
          border-radius: 6px;
        }
        .range-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .range-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .range-label {
          font-size: 12px;
          font-weight: 600;
          color: #7a5c3d;
        }
        /* ── nav bar ── */
        .nav-bar {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-top: 18px;
          flex-wrap: wrap;
        }
        .nav-btn {
          border: 2px solid var(--brand);
          border-radius: 14px;
          padding: 12px 20px;
          background: transparent;
          color: var(--brand);
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }
        .nav-btn:hover { background: #fef3e2; }
        .nav-btn-next {
          background: var(--brand);
          color: white;
        }
        .nav-btn-next:hover { background: #92400e; }
        .submit-button {
          border: 0;
          border-radius: 14px;
          padding: 12px 24px;
          background: #16a34a;
          color: white;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }
        .submit-button:hover { background: #15803d; }
        .submit-button[disabled] { opacity: .6; cursor: wait; }
        .status-box {
          flex: 1;
          min-height: 24px;
          font-size: 14px;
          color: #6b4d36;
        }
        .status-box.is-error { color: #b42318; }
        .status-box.is-success { color: #166534; }
        /* ── thank you screen ── */
        .thank-you-screen {
          display: none;
          text-align: center;
          padding: 48px 24px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 20px;
          box-shadow: 0 8px 30px rgba(65, 40, 27, 0.06);
          margin-top: 14px;
        }
        .thank-you-screen.visible { display: block; }
        .thank-you-icon {
          font-size: 56px;
          margin-bottom: 16px;
        }
        .thank-you-title {
          font-size: 26px;
          font-weight: 700;
          color: var(--ink);
          margin: 0 0 10px;
        }
        .thank-you-sub {
          font-size: 16px;
          color: #6b4d36;
          margin: 0 0 20px;
        }
        .thank-you-folio {
          display: inline-block;
          background: #f9e6c8;
          color: var(--brand);
          font-size: 13px;
          font-weight: 700;
          padding: 6px 16px;
          border-radius: 99px;
        }
        @media (max-width: 640px) {
          .profile-grid { grid-template-columns: 1fr; }
          .question-card { grid-template-columns: 1fr; }
          h1 { font-size: 22px; }
        }
      </style>
    </head>
    <body>
      <main class="shell">
        <section class="hero">
          <div class="eyebrow">Encuesta pública ATLX GT</div>
          <h1>${escapeHtml(payload.docName || payload.docCode || "Encuesta")}</h1>
          <div class="meta">Código: ${escapeHtml(payload.docCode || "-")} · Ejecutable: ${escapeHtml(payload.executableCode || "-")}</div>
          <p class="objective">${escapeHtml(payload.objective || "Responde directamente desde tu navegador.")}</p>
        </section>
        <div class="step-indicator">
          <div class="step-counter" id="step-counter">Paso 1 / ${totalSteps}</div>
          <div class="progress-bar">
            <div class="progress-fill" id="progress-fill" style="width:${Math.round(100 / totalSteps)}%"></div>
          </div>
        </div>
        <form id="survey-form">
          ${profileStepHtml}
          ${questionStepsHtml}
          <div class="nav-bar">
            <button type="button" id="btn-prev" class="nav-btn nav-btn-prev" style="display:none">&lt; ANTERIOR</button>
            <div class="status-box" id="status-box"></div>
            <button type="button" id="btn-next" class="nav-btn nav-btn-next">SIGUIENTE &gt;</button>
            <button type="button" id="submit-button" class="submit-button" style="display:none">CERRAR Y ENVIAR</button>
          </div>
        </form>
        <div class="thank-you-screen" id="thank-you-screen">
          <div class="thank-you-icon">&#x2705;</div>
          <h2 class="thank-you-title">&#xA1;Gracias por contestar nuestra encuesta!</h2>
          <p class="thank-you-sub">Tus respuestas han sido registradas. &#xA1;Vuelve pronto!</p>
          <span class="thank-you-folio" id="thank-you-folio"></span>
        </div>
      </main>
      <script>
        const surveyPayload = ${payloadJson};
        const TOTAL_STEPS = ${totalSteps};
        let currentStep = 0;
        const form = document.getElementById("survey-form");
        const submitButton = document.getElementById("submit-button");
        const statusBox = document.getElementById("status-box");
        const btnPrev = document.getElementById("btn-prev");
        const btnNext = document.getElementById("btn-next");
        const stepCounterEl = document.getElementById("step-counter");
        const progressFillEl = document.getElementById("progress-fill");
        const thankYouScreen = document.getElementById("thank-you-screen");
        const thankYouFolio = document.getElementById("thank-you-folio");
        const stepIndicator = document.getElementById && document.querySelector(".step-indicator");
        const startedAt = new Date().toISOString();

        function showThankYou(folio) {
          form.style.display = "none";
          if (stepIndicator) stepIndicator.style.display = "none";
          thankYouFolio.textContent = folio ? "Folio de recepci\u00f3n: " + folio : "";
          thankYouScreen.classList.add("visible");
        }

        function setStatus(message, tone) {
          statusBox.textContent = message || "";
          statusBox.className = "status-box" + (tone ? " is-" + tone : "");
        }

        function showStep(n) {
          document.querySelectorAll(".step").forEach(function(el) {
            el.classList.remove("active");
          });
          const target = document.getElementById("step-" + n);
          if (target) target.classList.add("active");
          stepCounterEl.textContent = "Paso " + (n + 1) + " / " + TOTAL_STEPS;
          progressFillEl.style.width = Math.round(((n + 1) / TOTAL_STEPS) * 100) + "%";
          btnPrev.style.display = n === 0 ? "none" : "";
          const isLast = n === TOTAL_STEPS - 1;
          btnNext.style.display = isLast ? "none" : "";
          submitButton.style.display = isLast ? "" : "none";
        }

        btnNext.addEventListener("click", function() {
          if (currentStep === 0) {
            const fd = new FormData(form);
            if (fd.get("consentGiven") !== "1") {
              setStatus("Debes otorgar consentimiento para continuar.", "error");
              return;
            }
          }
          setStatus("", "");
          if (currentStep < TOTAL_STEPS - 1) {
            currentStep++;
            showStep(currentStep);
          }
        });

        btnPrev.addEventListener("click", function() {
          setStatus("", "");
          if (currentStep > 0) {
            currentStep--;
            showStep(currentStep);
          }
        });

        function buildAnswers(formData) {
          const answers = {};

          for (const line of surveyPayload.lines || []) {
            const key = "q_" + line.executableLineId;
            const answerKind = ${resolveAnswerKind.toString()}(line);

            if (answerKind === "rango") {
              const minVal = String(formData.get(key + "_min") || "").trim();
              const maxVal = String(formData.get(key + "_max") || "").trim();
              if (minVal) answers[key + "_min"] = Number(minVal);
              if (maxVal) answers[key + "_max"] = Number(maxVal);
              continue;
            }

            if (answerKind === "choice_multi") {
              const values = formData.getAll(key).map((value) => String(value || "").trim()).filter(Boolean);
              if (values.length) {
                answers[key] = values;
              }
              continue;
            }

            if (answerKind === "choice_single") {
              const value = String(formData.get(key) || "").trim();
              if (value) answers[key] = value;
              continue;
            }

            const value = String(formData.get(key) || "").trim();
            if (!value) continue;

            answers[key] = answerKind === "numeric" || answerKind === "likert"
              ? Number(value)
              : value;
          }

          return answers;
        }

        submitButton.addEventListener("click", async function() {
          const formData = new FormData(form);
          const answers = buildAnswers(formData);
          if (!Object.keys(answers).length) {
            setStatus("Captura al menos una respuesta antes de enviar.", "error");
            return;
          }

          if (formData.get("consentGiven") !== "1") {
            setStatus("Debes otorgar consentimiento para enviar la encuesta.", "error");
            return;
          }

          submitButton.disabled = true;
          setStatus("Enviando respuestas...", "");

          try {
            const response = await fetch(window.location.pathname + "/submit", {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                submission: {
                  submissionUuid: (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
                    ? globalThis.crypto.randomUUID()
                    : "web-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10),
                  surveyExecutableId: "exe-" + surveyPayload.executableId,
                  consentGiven: true,
                  consentAt: new Date().toISOString(),
                  consentTextVersion: "GT-CONSENT-V1",
                  captureChannel: "web",
                  profileTypeCode: "CLIENTE_FINAL",
                  respondentRef: String(formData.get("respondentRef") || "").trim() || null,
                  respondentName: String(formData.get("respondentName") || "").trim() || null,
                  businessName: String(formData.get("businessName") || "").trim() || null,
                  evidence: {},
                  answers,
                  startedAt,
                  finalizedAt: new Date().toISOString(),
                },
              }),
            });

            const payload = await response.json();
            if (!response.ok || !payload?.ok) {
              throw new Error(payload?.detail || payload?.error || "No fue posible guardar la encuesta.");
            }

            showThankYou(payload?.ack?.serverSubmissionId || null);
          } catch (error) {
            setStatus(error?.message || "No fue posible guardar la encuesta.", "error");
          } finally {
            submitButton.disabled = false;
          }
        });

        showStep(0);
      </script>
    </body>
  </html>`;
}

// ── Short link redirect ──
router.get("/s/:code", (req, res) => {
  const target = shortLinks[req.params.code];
  if (!target) return res.status(404).send("Link no encontrado o expirado.");
  res.redirect(302, target);
});

router.get("/encuestas/shorten", async (req, res) => {
  const url = String(req.query.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ ok: false, error: "url param required" });
  }
  try {
    const code = generateShortCode();
    shortLinks[code] = url;
    saveShortLinks(shortLinks);
    const short = `${getServerBase(req)}/s/${code}`;
    return res.json({ ok: true, short });
  } catch {
    return res.json({ ok: true, short: url });
  }
});

const publicSubmissionSchema = z.object({
  submission: z.object({
    submissionUuid: z.string().min(8).optional(),
    surveyExecutableId: z.any(),
    consentGiven: z.boolean(),
    consentAt: z.string().optional().nullable(),
    consentTextVersion: z.string().optional().nullable(),
    captureChannel: z.string().optional().nullable(),
    profileTypeCode: z.string().optional().nullable(),
    respondentRef: z.string().optional().nullable(),
    respondentName: z.string().optional().nullable(),
    businessName: z.string().optional().nullable(),
    evidence: z.record(z.any()).optional(),
    answers: z.record(z.any()),
    startedAt: z.string().optional().nullable(),
    finalizedAt: z.string().optional().nullable(),
  }),
});

router.get("/encuestas/open/:executableCode", async (req, res) => {
  try {
    const row = await getPublicSurveyExecutableService(req.params.executableCode);
    if (!row) {
      return res.status(404).send("<h1>Encuesta no encontrada</h1><p>El ejecutable solicitado no existe o ya no está activo.</p>");
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.send(renderSurveyPage(row));
  } catch (error) {
    return res.status(500).send(`<h1>Error</h1><p>${escapeHtml(error?.message || "No fue posible abrir la encuesta.")}</p>`);
  }
});

router.post("/encuestas/open/:executableCode/submit", async (req, res) => {
  const parsed = publicSubmissionSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid public survey payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const row = await getPublicSurveyExecutableService(req.params.executableCode);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Public survey executable not found" });
    }

    const ack = await pushSubmissionService({
      deviceId: "public-web",
      submission: {
        ...parsed.data.submission,
        surveyExecutableId: `exe-${row.executableId}`,
        captureChannel: "web",
      },
    });

    return res.status(202).json({ ok: true, ack });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed public survey submit",
      detail: error?.message || "No fue posible guardar la encuesta.",
    });
  }
});

export default router;