import crypto from "node:crypto";
import { getAppPool, sqlType } from "../../db/sql.js";
import { GT_COMPATIBILITY_SCOPE_ID } from "../../domain/gtTenantPolicy.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function toEventRow(row) {
  return {
    id: String(row.EventId || ""),
    createdAt: row.EventAt ? String(row.EventAt) : null,
    userName: String(row.UserName || row.UserId || ""),
    result: row.Success ? "OK" : "DENY",
    eventType: String(row.EventType || ""),
    ip: String(row.IpAddress || ""),
    sessionId: String(row.SessionId || ""),
    deviceId: String(row.DeviceId || ""),
    success: row.Success === true,
  };
}

function toSessionRow(row) {
  return {
    id: String(row.SessionId || ""),
    userName: String(row.UserName || row.UserId || ""),
    deviceId: String(row.DeviceId || ""),
    issuedAt: row.IssuedAt ? String(row.IssuedAt) : null,
    expiresAt: row.ExpiresAt ? String(row.ExpiresAt) : null,
    revokedAt: row.RevokedAt ? String(row.RevokedAt) : null,
    lastSeenAt: row.LastSeenAt ? String(row.LastSeenAt) : null,
    isRevoked: Boolean(row.RevokedAt),
  };
}

export async function getSecurityControlOverviewCrudDorado({ tenantId }) {
  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const pool = await getAppPool();

  const summaryResult = await pool.request().input("tenant_id", sql.NVarChar(100), normalizedTenantId).query(`
    SELECT
      (
        SELECT COUNT(1)
        FROM core_configuracion.sec_sessions
        WHERE TenantId = @tenant_id
          AND RevokedAt IS NULL
          AND (ExpiresAt IS NULL OR ExpiresAt >= SYSUTCDATETIME())
      ) AS active_sessions,
      (
        SELECT COUNT(1)
        FROM core_configuracion.sec_sessions
        WHERE TenantId = @tenant_id
          AND RevokedAt IS NOT NULL
      ) AS revoked_sessions,
      (
        SELECT COUNT(1)
        FROM core_configuracion.sec_auth_events
        WHERE TenantId = @tenant_id
          AND Success = 0
          AND EventAt >= DATEADD(HOUR, -24, SYSUTCDATETIME())
      ) AS failed_events_24h,
      (
        SELECT COUNT(1)
        FROM core_configuracion.sec_auth_events
        WHERE TenantId = @tenant_id
          AND Success = 1
          AND EventAt >= DATEADD(HOUR, -24, SYSUTCDATETIME())
      ) AS successful_events_24h;
  `);

  const eventsResult = await pool.request().input("tenant_id", sql.NVarChar(100), normalizedTenantId).query(`
    SELECT TOP 25
      e.EventId,
      e.UserId,
      u.UserName,
      e.EventType,
      e.EventAt,
      e.SessionId,
      e.DeviceId,
      e.IpAddress,
      e.Success
    FROM core_configuracion.sec_auth_events e
    LEFT JOIN core_configuracion.sec_users u
      ON u.UserId = e.UserId
    WHERE e.TenantId = @tenant_id
    ORDER BY e.EventAt DESC;
  `);

  const sessionsResult = await pool.request().input("tenant_id", sql.NVarChar(100), normalizedTenantId).query(`
    SELECT TOP 25
      s.SessionId,
      s.UserId,
      u.UserName,
      s.DeviceId,
      s.IssuedAt,
      s.ExpiresAt,
      s.RevokedAt,
      s.RevokeReason,
      s.LastSeenAt
    FROM core_configuracion.sec_sessions s
    LEFT JOIN core_configuracion.sec_users u
      ON u.UserId = s.UserId
    WHERE s.TenantId = @tenant_id
    ORDER BY COALESCE(s.LastSeenAt, s.IssuedAt) DESC;
  `);

  const summary = summaryResult.recordset?.[0] || {};
  return {
    summary: {
      activeSessions: Number(summary.active_sessions || 0),
      revokedSessions: Number(summary.revoked_sessions || 0),
      failedEvents24h: Number(summary.failed_events_24h || 0),
      successfulEvents24h: Number(summary.successful_events_24h || 0),
    },
    events: (eventsResult.recordset || []).map(toEventRow),
    sessions: (sessionsResult.recordset || []).map(toSessionRow),
  };
}

export async function revokeSecuritySessionCrudDorado({ tenantId, sessionId, revokeReason }) {
  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const normalizedSessionId = normalizeText(sessionId);
  const normalizedReason = normalizeText(revokeReason) || "ADMIN_MANUAL_REVOKE";
  if (!normalizedSessionId) return 0;

  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const sessionResult = await new sql.Request(tx)
      .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
      .input("session_id", sql.NVarChar(120), normalizedSessionId)
      .input("revoke_reason", sql.NVarChar(255), normalizedReason)
      .query(`
        UPDATE core_configuracion.sec_sessions
        SET RevokedAt = COALESCE(RevokedAt, SYSUTCDATETIME()),
            RevokeReason = @revoke_reason
        WHERE TenantId = @tenant_id
          AND SessionId = @session_id;
      `);

    if (Number(sessionResult.rowsAffected?.[0] || 0) > 0) {
      await new sql.Request(tx)
        .input("event_id", sql.NVarChar(120), crypto.randomUUID())
        .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
        .input("session_id", sql.NVarChar(120), normalizedSessionId)
        .input("event_type", sql.NVarChar(120), "SESSION_REVOKED")
        .input("detail_json", sql.NVarChar(sql.MAX), JSON.stringify({ revokeReason: normalizedReason }))
        .query(`
          INSERT INTO core_configuracion.sec_auth_events (
            EventId, TenantId, UserId, EventType, EventAt,
            SessionId, DeviceId, IpAddress, UserAgent, Success, DetailJson
          )
          SELECT
            @event_id,
            TenantId,
            UserId,
            @event_type,
            SYSUTCDATETIME(),
            SessionId,
            DeviceId,
            NULL,
            'gt-api',
            1,
            @detail_json
          FROM core_configuracion.sec_sessions
          WHERE TenantId = @tenant_id
            AND SessionId = @session_id;
        `);
    }

    await tx.commit();
    return Number(sessionResult.rowsAffected?.[0] || 0);
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
