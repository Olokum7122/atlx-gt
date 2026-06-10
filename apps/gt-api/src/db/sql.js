import sql from "mssql";
import { config } from "../config.js";

let appPoolPromise;
let analyticsPoolPromise;
let antojadosPoolPromise;

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

export function getAppPool() {
  if (!appPoolPromise) {
    appPoolPromise = sql.connect(createSqlConfig(config.dbAppName));
  }
  return appPoolPromise;
}

export function getAnalyticsPool() {
  if (!analyticsPoolPromise) {
    analyticsPoolPromise = new sql.ConnectionPool(createSqlConfig(config.dbAnalyticsName)).connect();
  }
  return analyticsPoolPromise;
}

export function getAntojadosPool() {
  if (!antojadosPoolPromise) {
    antojadosPoolPromise = new sql.ConnectionPool(createSqlConfig(config.dbAntojadosName)).connect();
  }
  return antojadosPoolPromise;
}

export function sqlType() {
  return sql;
}
