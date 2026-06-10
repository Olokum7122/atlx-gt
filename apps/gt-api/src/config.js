import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename_cfg = fileURLToPath(import.meta.url);
const __dirname_cfg = path.dirname(__filename_cfg);
// Resolve .env relative to this file (apps/gt-api/src/ → apps/gt-api/.env)
// regardless of process.cwd() at startup time.
dotenv.config({ path: path.resolve(__dirname_cfg, "../.env") });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readUniverseMap() {
  const defaultDir = path.resolve(__dirname, "../../../../ATLX_ECOSYSTEM_CONNECTIONS");
  const ecosystemDir = process.env.ATLX_ECOSYSTEM_CONNECTIONS_DIR || defaultDir;
  const mapPath = path.join(ecosystemDir, "universes.map.json");

  try {
    if (!fs.existsSync(mapPath)) {
      return { ecosystemDir, mapPath, map: null };
    }
    const raw = fs.readFileSync(mapPath, "utf8");
    return { ecosystemDir, mapPath, map: JSON.parse(raw) };
  } catch (error) {
    console.warn("[atlx-gt-api] unable to read universes.map.json", error.message);
    return { ecosystemDir, mapPath, map: null };
  }
}

const universeCtx = readUniverseMap();
const gtUniverse = universeCtx.map?.universes?.ATLX_GT;
const gtDbAppFromMap = gtUniverse?.dbPrimary || "";
const gtDbAnalyticsFromMap = gtUniverse?.dbSecondary?.[0] || "";
const gtDbIntegrationFromMap = gtUniverse?.dbSecondary?.[1] || "";
const gtParentUniverseFromMap = gtUniverse?.parent || universeCtx.map?.parentUniverse || "";
const resolvedNodeEnv = process.env.NODE_ENV || "development";
const defaultAntojadosApiBaseUrl =
  resolvedNodeEnv === "development"
    ? "http://localhost:8010/api/v1"
    : "https://api.antojadosmx.mx/api/v1";

export const config = {
  port: Number(process.env.PORT || 4010),
  nodeEnv: resolvedNodeEnv,
  publicBaseUrl: String(process.env.GT_PUBLIC_BASE_URL || "").trim().replace(/\/+$/g, ""),
  antojadosApiBaseUrl: String(
    process.env.GT_ANTOJADOS_API_BASE_URL || defaultAntojadosApiBaseUrl,
  ).trim().replace(/\/+$/g, ""),
  syncSharedKey: process.env.GT_SYNC_SHARED_KEY || "",
  ecosystemConnectionsDir: universeCtx.ecosystemDir,
  universeMapPath: universeCtx.mapPath,
  universeCode: "ATLX_GT",
  parentUniverse: process.env.GT_PARENT_UNIVERSE || gtParentUniverseFromMap,
  dbAppName: process.env.GT_DB_APP || gtDbAppFromMap,
  dbAnalyticsName: process.env.GT_DB_ANALYTICS || gtDbAnalyticsFromMap || process.env.GT_DB_APP || gtDbAppFromMap,
  dbIntegrationName: process.env.GT_DB_INTEGRATION || gtDbIntegrationFromMap,
  dbAntojadosName: process.env.GT_DB_ANTOJADOS || "ATLX_ANTOJADOS_APP",
  sqlHost: process.env.GT_SQL_HOST || "localhost",
  sqlPort: Number(process.env.GT_SQL_PORT || 1433),
  sqlUser: process.env.GT_SQL_USER || "sa",
  sqlPassword: process.env.GT_SQL_PASSWORD || "",
  sqlEncrypt: String(process.env.GT_SQL_ENCRYPT || "false").toLowerCase() === "true",
  sqlTrustServerCertificate:
    String(process.env.GT_SQL_TRUST_SERVER_CERT || "true").toLowerCase() === "true",
  apiBasePath: process.env.GT_API_BASE_PATH || "/api/v1"
};
