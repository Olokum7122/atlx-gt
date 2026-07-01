import { Router } from "express";
import { z } from "zod";
import {
  createTenantService,
  getTenantService,
  listTenantsService,
} from "../services/tenantsService.js";

const router = Router();

const createSchema = z.object({
  tenant_id: z.string().trim().min(1),
  tenant_type: z.string().trim().min(1).optional(),
  display_name: z.string().trim().min(1),
  legal_name: z.string().trim().optional(),
  logo_url: z.string().trim().optional(),
  primary_color: z.string().trim().optional(),
  watermark_text: z.string().trim().optional(),
  watermark_logo_url: z.string().trim().optional(),
  correlation_id: z.string().trim().optional(),
  request_id: z.string().trim().optional(),
});

router.post("/tenants", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const data = await createTenantService(parsed.data);
    return res.status(201).json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to create tenant",
      detail: error.message,
    });
  }
});

router.get("/tenants", async (req, res) => {
  try {
    const status = String(req.query.status || "").trim() || null;
    const data = await listTenantsService(status);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list tenants",
      detail: error.message,
    });
  }
});

router.get("/tenants/:tenantId", async (req, res) => {
  try {
    const data = await getTenantService(req.params.tenantId);
    if (!data.tenant) {
      return res.status(404).json({ ok: false, error: "Tenant not found" });
    }
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get tenant",
      detail: error.message,
    });
  }
});

export default router;
