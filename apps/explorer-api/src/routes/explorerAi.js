/**
 * POST /api/v1/explorer/ai/review
 *
 * Asistente editorial vía DeepSeek API.
 * Recibe texto y tipo de elemento, devuelve correcciones.
 */

import { Router } from "express";

const router = Router();

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat"; // deepseek-v3

const SYSTEM_PROMPT = `Eres un asistente editorial especializado en corregir y mejorar textos en español para publicaciones de redes sociales y posts de restaurantes/comida (Antojados MX).

Tu tarea es revisar el texto del usuario y devolver una respuesta JSON con:

1. **corrected**: el texto corregido (con ortografía, gramática, sintaxis y estilo mejorados)
2. **summary**: un resumen breve de los cambios realizados (máximo 2 oraciones)
3. **changes**: un array de objetos con { "type": "ortografía"|"gramática"|"estilo"|"tono", "description": "descripción del cambio" }

Reglas:
- Corrige ortografía y tildes
- Mejora la redacción y fluidez sin cambiar el significado
- Adapta el tono según el tipo de elemento: "title" → llamativo, "body" → descriptivo, "price" → claro y directo, "badge" → corto y persuasivo
- NO agregues información que no esté en el original
- Preserva emojis y formato especial
- Responde ÚNICAMENTE con el JSON, sin texto adicional`;

/**
 * POST /ai/review
 */
router.post("/ai/review", async (req, res) => {
  try {
    const { text, element_type } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ ok: false, error: "text is required" });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "DEEPSEEK_API_KEY not configured",
      });
    }

    const userPrompt = `Revisa el siguiente texto${element_type ? ` (tipo: ${element_type})` : ""}:\n\n${text}`;

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[explorer-api][ai] DeepSeek error:", response.status, errBody);
      return res.status(502).json({
        ok: false,
        error: `DeepSeek API error: ${response.status}`,
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({
        ok: false,
        error: "DeepSeek returned empty response",
      });
    }

    // Intentar parsear el JSON de la respuesta
    let corrections;
    try {
      // Buscar JSON dentro de la respuesta (por si viene con markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      corrections = JSON.parse(jsonStr);
    } catch {
      // Si no se puede parsear, devolver el texto como corrected
      corrections = {
        corrected: content,
        summary: "Revisión completada",
        changes: [],
      };
    }

    return res.json({
      ok: true,
      corrections,
    });
  } catch (err) {
    console.error("[explorer-api][ai] Error:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

export default router;
