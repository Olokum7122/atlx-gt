import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { buildOpenApiSpec } from "./docs/openapi.js";
import healthRouter from "./routes/health.js";
import syncIngestRouter from "./routes/syncIngest.js";
import configDimensionsRouter from "./routes/configDimensions.js";
import configLocationsRouter from "./routes/configLocations.js";
import configCatalogsRouter from "./routes/configCatalogs.js";
import configComponentsRouter from "./routes/configComponents.js";
import configCategoriesRouter from "./routes/configCategories.js";
import configClasificacionesRouter from "./routes/configClasificaciones.js";
import configAccessAssignmentsRouter from "./routes/configAccessAssignments.js";
import configUsersRouter from "./routes/configUsers.js";
import configRolesRouter from "./routes/configRoles.js";
import configSecurityControlRouter from "./routes/configSecurityControl.js";
import configPasswordResetsRouter from "./routes/configPasswordResets.js";
import analyticsSurveyResponseProfilesRouter from "./routes/analyticsSurveyResponseProfiles.js";
import analyticsSurveyDocsRouter from "./routes/analyticsSurveyDocs.js";
import analyticsSurveyReceptionRouter from "./routes/analyticsSurveyReception.js";
import collectorInstallerRouter from "./routes/collectorInstaller.js";
import surveyPublicWebRouter from "./routes/surveyPublicWeb.js";
import antojadosConfiguracionRouter from "./routes/antojadosConfiguracion.js";
import antojadosEfirmaRouter from "./routes/antojadosEfirma.js";

const app = express();
app.set("trust proxy", true);
const openApiSpec = buildOpenApiSpec({
  port: config.port,
  apiBasePath: config.apiBasePath,
});

const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/downloads", express.static(join(__dirname, "..", "public", "downloads")));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    app: "atlx-gt-api",
    purpose: "managerial and analytics backend",
    docs: {
      swaggerUi: "/docs",
      openApiJson: "/openapi.json",
    },
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use("/health", healthRouter);
app.use("/api/sync", syncIngestRouter);
app.use(`${config.apiBasePath}/sync`, syncIngestRouter);
app.use(`${config.apiBasePath}/config`, configDimensionsRouter);
app.use(`${config.apiBasePath}/config`, configLocationsRouter);
app.use(`${config.apiBasePath}/config`, configCatalogsRouter);
app.use(`${config.apiBasePath}/config`, configComponentsRouter);
app.use(`${config.apiBasePath}/config`, configCategoriesRouter);
app.use(`${config.apiBasePath}/config`, configClasificacionesRouter);
app.use(`${config.apiBasePath}/config`, configAccessAssignmentsRouter);
app.use(`${config.apiBasePath}/config`, configUsersRouter);
app.use(`${config.apiBasePath}/config`, configRolesRouter);
app.use(`${config.apiBasePath}/config`, configSecurityControlRouter);
app.use(`${config.apiBasePath}/config`, configPasswordResetsRouter);
app.use(`${config.apiBasePath}/analytics`, analyticsSurveyResponseProfilesRouter);
app.use(`${config.apiBasePath}/analytics`, analyticsSurveyDocsRouter);
app.use(`${config.apiBasePath}/analytics`, analyticsSurveyReceptionRouter);
app.use(`${config.apiBasePath}`, collectorInstallerRouter);
app.use(`${config.apiBasePath}/antojados/gt`, antojadosConfiguracionRouter);
app.use(`${config.apiBasePath}/antojados/gt`, antojadosEfirmaRouter);
app.use("/", surveyPublicWebRouter);

app.use((err, _req, res, _next) => {
  console.error("[atlx-gt-api] unhandled error", err);
  res.status(500).json({ ok: false, error: "Internal error" });
});

app.listen(config.port, () => {
  console.log(`[atlx-gt-api] listening on http://localhost:${config.port}`);
  console.log(`[atlx-gt-api] swagger on http://localhost:${config.port}/docs`);
});
