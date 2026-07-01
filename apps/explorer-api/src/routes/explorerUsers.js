import { Router } from "express";
import { z } from "zod";
import {
  upsertUserFromAuthService,
  getUserService,
  listUsersByTenantService,
} from "../services/usersService.js";

const router = Router();

const upsertSchema = z.object({
  user_id: z.string().trim().min(1),
  tenant_id: z.string().trim().min(1),
  auth_provider: z.string().trim().optional(),
  auth_subject: z.string().trim().optional(),
  email_hash: z.string().trim().optional(),
  display_name: z.string().trim().min(1),
  avatar_url: z.string().trim().optional(),
  role: z.string().trim().optional(),
  correlation_id: z.string().trim().optional(),
  request_id: z.string().trim().optional(),
});

router.post("/users/from-auth", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid payload",
      issues: parsed.error.issues,
    });
  }

  try {
    const data = await upsertUserFromAuthService(parsed.data);
    return res.status(201).json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to upsert user",
      detail: error.message,
    });
  }
});

router.get("/users/:userId", async (req, res) => {
  try {
    const data = await getUserService(req.params.userId);
    if (!data.user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to get user",
      detail: error.message,
    });
  }
});

router.get("/tenants/:tenantId/users", async (req, res) => {
  try {
    const status = String(req.query.status || "").trim() || null;
    const data = await listUsersByTenantService(req.params.tenantId, status);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Failed to list users",
      detail: error.message,
    });
  }
});

export default router;
