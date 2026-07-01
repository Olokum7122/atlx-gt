import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "explorer-api",
    uptimeSec: Math.round(process.uptime()),
  });
});

export default router;
