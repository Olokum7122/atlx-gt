import sql from "mssql";
import { config } from "../config.js";

let explorerPoolPromise;

function createSqlConfig(database) {
  return {
    user: config.sqlUser,
    password: config.sqlPassword,
    server: config.sqlHost,
    port: config.sqlPort,
    database,
    options: {
      encrypt: config.sqlEncrypt,
      trustServerCertificate: config.sqlTrustServerCertificate,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

/**
 * Obtiene el pool de conexión a ATLX_EXPLORER_APP
 */
export function getExplorerPool() {
  if (!explorerPoolPromise) {
    explorerPoolPromise = new sql.ConnectionPool(
      createSqlConfig(config.dbExplorerName),
    ).connect();
  }
  return explorerPoolPromise;
}

/**
 * Exporta los tipos SQL para usar en .input() tipado
 */
export function sqlType() {
  return sql;
}
