import { Router } from "express";
import { z } from "zod";
import {
  createProjectService,
  getProjectService,
  listProjectsService,
  updateProjectService,
  setProjectStatusService,
  attachAssetService,
} from "../services/projectsService.js";

const router = Router();

const createSchema = z.object({
  project_id: z.string().trim().min(1),
  tenant_id: z.string().trim().min(1),
  owner_user_id: z.string().trim().optional(),
  title: z.string().trim().optional(),
  tipo_post: z.string().trim().optional(),
  tipo_content: z.string().trim().optional(),
  efecto_global: z.string().trim().optional(),
  composicion: z.any().optional(),
  media_asset_id: z.string().trim().optional(),
  media_url: z.string().trim().optional(),
  media_thumbnail_url: z.string().trim().optional(),
  media_feed_url: z.string().trim().optional(),
  media_full_url: z.string().trim().optional(),
  media_type: z.string().trim().optional(),
  correlation_id: z.string().trim().optional(),
  request_id: z.string().trim().optional(),
});

const updateSchema = z.object({
  project_id: z.string().trim().min(1),
  title: z.string().trim().optional(),
  tipo_post: z.string().trim().optional(),
  tipo_content: z.string().trim().optional(),
  efecto_global: z.string().trim().optional(),
  composicion: z.any().optional(),
  media_asset_id: z.string().trim().optional(),
  media_url: z.string().trim().optional(),
  media_thumbnail_url: z.string().trim().optional(),
  media_feed_url: z.string().trim().optional(),
  media_full_url: z.string().trim().optional(),
  media_type: z.string().trim().optional(),
  correlation_id: z.string().trim().optional(),
  request_id: z.string().trim().optional(),
});

const attachAssetSchema = z.object({
  asset_id: z.string().trim().min(1),
  project_id: z.string().trim().min(1),
  tenant_id: z.string().trim().min(1),
  media_asset_id: z.string().trim().optional(),
  role: z.string().trim().optional(),
  original_url: z.string().trim().optional(),
  thumb_url: z.string().trim().optional(),
  feed_url: z.string().trim().optional(),
  full_url: z.string().trim().optional(),
  sort_order: z.number().int().optional(),
  correlation_id: z.string().trim().optional(),
  request_id: z.string().trim().optional(),
});

router.post("/projects", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const data = await createProjectService(parsed.data);
    return res.status(201).json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to create project",
      detail: error.message,
    });
  }
});

router.get("/projects/:projectId", async (req, res) => {
  try {
    const data = await getProjectService(req.params.projectId);
    if (!data.project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get project",
      detail: error.message,
    });
  }
});

router.get("/tenants/:tenantId/projects", async (req, res) => {
  try {
    const query = {
      owner_user_id: String(req.query.owner_user_id || "").trim() || null,
      status: String(req.query.status || "").trim() || null,
      tipo_post: String(req.query.tipo_post || "").trim() || null,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    };
    const data = await listProjectsService(req.params.tenantId, query);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list projects",
      detail: error.message,
    });
  }
});

router.patch("/projects/:projectId", async (req, res) => {
  const parsed = updateSchema.safeParse({ ...req.body, project_id: req.params.projectId });
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const data = await updateProjectService(parsed.data);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to update project",
      detail: error.message,
    });
  }
});

router.patch("/projects/:projectId/status", async (req, res) => {
  const statusSchema = z.object({
    status: z.enum(["draft", "published", "archived"]),
    published_at: z.string().trim().optional(),
  });

  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid status payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const data = await setProjectStatusService(
      req.params.projectId,
      parsed.data.status,
      parsed.data.published_at || null,
    );
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to update project status",
      detail: error.message,
    });
  }
});

router.post("/projects/:projectId/assets", async (req, res) => {
  const parsed = attachAssetSchema.safeParse({
    ...req.body,
    project_id: req.params.projectId,
  });

  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid asset payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const data = await attachAssetService(parsed.data);
    return res.status(201).json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to attach asset",
      detail: error.message,
    });
  }
});

export default router;
