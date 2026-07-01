import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz del proyecto explorer-api
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const resolvedNodeEnv = process.env.NODE_ENV || "development";

export const config = {
  port: Number(process.env.EXPLORER_PORT || 4101),
  nodeEnv: resolvedNodeEnv,
  antojadosApiBaseUrl: String(
    process.env.EXPLORER_ANTOJADOS_API_BASE_URL ||
      (resolvedNodeEnv === "development"
        ? "http://localhost:9000/api/v1"
        : "https://api.antojadosmx.mx/api/v1"),
  ).trim().replace(/\/+$/g, ""),
  engineApiBaseUrl: String(
    process.env.EXPLORER_ENGINE_API_BASE_URL ||
      (resolvedNodeEnv === "development"
        ? "http://localhost:4100"
        : "http://localhost:4100"),
  ).trim().replace(/\/+$/g, ""),

  // SQL Server — Explorer DB
  sqlHost: process.env.EXPLORER_SQL_HOST || process.env.ME_SQL_HOST || "185.187.235.253",
  sqlPort: Number(process.env.EXPLORER_SQL_PORT || process.env.ME_SQL_PORT || 1433),
  sqlUser: process.env.EXPLORER_SQL_USER || process.env.ME_SQL_USER || "sa",
  sqlPassword: process.env.EXPLORER_SQL_PASSWORD || process.env.ME_SQL_PASSWORD || "",
  sqlEncrypt: String(process.env.EXPLORER_SQL_ENCRYPT || "false").toLowerCase() === "true",
  sqlTrustServerCertificate:
    String(process.env.EXPLORER_SQL_TRUST_SERVER_CERT || "true").toLowerCase() === "true",
  dbExplorerName: process.env.EXPLORER_DB_NAME || "ATLX_EXPLORER_APP",

  apiBasePath: process.env.EXPLORER_API_BASE_PATH || "/api/v1/explorer",
};
