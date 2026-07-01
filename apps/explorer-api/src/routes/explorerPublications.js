import { Router } from "express";
import { z } from "zod";
import {
  publishProjectService,
  listPublicationsService,
  getComposicionFeedService,
} from "../services/publicationsService.js";

const router = Router();

const publishSchema = z.object({
  project_id: z.string().trim().min(1),
  destination_id: z.string().trim().min(1),
  tenant_id: z.string().trim().min(1),
  feed_type: z.string().trim().optional(),
  author_handle: z.string().trim().optional(),
  author_avatar_url: z.string().trim().optional(),
  actor_user_id: z.string().trim().optional(),
  correlation_id: z.string().trim().optional(),
  request_id: z.string().trim().optional(),
});

router.post("/publications/publish", async (req, res) => {
  const parsed = publishSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const data = await publishProjectService(parsed.data);
    return res.status(201).json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to publish project",
      detail: error.message,
    });
  }
});

router.get("/tenants/:tenantId/publications", async (req, res) => {
  try {
    const query = {
      project_id: String(req.query.project_id || "").trim() || null,
      status: String(req.query.status || "").trim() || null,
      feed_type: String(req.query.feed_type || "").trim() || null,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    };
    const data = await listPublicationsService(req.params.tenantId, query);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list publications",
      detail: error.message,
    });
  }
});

/**
 * Feed de consumo para apps móviles.
 * 
 * GET /tenants/:tenantId/feed/:feedType
 * 
 * Este es el endpoint que usarán las apps Android/iOS para obtener
 * las publicaciones con la composición JSON completa. La app recibe
 * blocks con tipo, contenido, estilo y posición, y los renderiza
 * interactivamente (touch en imagen → fullscreen, touch en otro elemento → zoom).
 * 
 * Query params:
 *   - limit (number, default 50)
 *   - offset (number, default 0)
 */
router.get("/tenants/:tenantId/feed/:feedType", async (req, res) => {
  try {
    const query = {
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    };
    const data = await getComposicionFeedService(
      req.params.tenantId,
      req.params.feedType,
      query,
    );
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to load feed",
      detail: error.message,
    });
  }
});

/**
 * Obtener una publicación individual por ID.
 * GET /publications/:publicationId
 * Útil para ver detalle de un post específico.
 */
router.get("/publications/:publicationId", async (req, res) => {
  try {
    const { getPublicationService } = await import("../services/publicationsService.js");
    const data = await getPublicationService(req.params.publicationId);
    if (!data.publication) {
      return res.status(404).json({ ok: false, error: "Publication not found" });
    }
    // Parsear payload para devolver composición
    const pub = data.publication;
    let payload = {};
    try {
      payload = typeof pub.payload === "string" ? JSON.parse(pub.payload) : (pub.payload || {});
    } catch { payload = {}; }

    return res.json({
      ok: true,
      publication: {
        id: pub.externalPostId || pub.publicationId,
        feed_type: pub.feedType,
        destination_id: pub.destinationId,
        published_at: pub.publishedAt,
        composicion: payload.composicion || null,
        title: payload.title || null,
        media_url: payload.media_url || null,
        media_feed_url: payload.media_feed_url || null,
        media_thumbnail_url: payload.media_thumbnail_url || null,
        media_full_url: payload.media_full_url || null,
        media_type: payload.media_type || null,
        author_handle: payload.author_handle || null,
        author_avatar_url: payload.author_avatar_url || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get publication",
      detail: error.message,
    });
  }
});

export default router;
