import express from "express";
import cors from "cors";
import { config } from "./config.js";
import healthRouter from "./routes/health.js";
import explorerTenantsRouter from "./routes/explorerTenants.js";
import explorerUsersRouter from "./routes/explorerUsers.js";
import explorerProjectsRouter from "./routes/explorerProjects.js";
import explorerDestinationsRouter from "./routes/explorerDestinations.js";
import explorerPublicationsRouter from "./routes/explorerPublications.js";
import explorerAiRouter from "./routes/explorerAi.js";

const app = express();
app.set("trust proxy", true);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    app: "explorer-api",
    purpose: "Explorer App backend — CRUD de proyectos, publicaciones y destinos",
  });
});

// Health
app.use("/health", healthRouter);

// API endpoints
app.use(`${config.apiBasePath}`, explorerTenantsRouter);
app.use(`${config.apiBasePath}`, explorerUsersRouter);
app.use(`${config.apiBasePath}`, explorerProjectsRouter);
app.use(`${config.apiBasePath}`, explorerDestinationsRouter);
app.use(`${config.apiBasePath}`, explorerPublicationsRouter);
app.use(`${config.apiBasePath}`, explorerAiRouter);

// Error handler
app.use((err, _req, res, _next) => {
  console.error("[explorer-api] unhandled error", err);
  res.status(500).json({ ok: false, error: "Internal error" });
});

app.listen(config.port, () => {
  console.log(`[explorer-api] listening on http://localhost:${config.port}`);
  console.log(`[explorer-api] API base path: ${config.apiBasePath}`);
});
