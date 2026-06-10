import { randomUUID } from "crypto";

const instanceState = new Map(); // instanceId -> { version, updatedAt }
const instanceClients = new Map(); // instanceId -> Map(clientId, { res, heartbeat })

function normalizeInstanceId(instanceId) {
  return String(instanceId || "").trim();
}

function ensureState(instanceId) {
  const id = normalizeInstanceId(instanceId);
  if (!id) return null;
  const current = instanceState.get(id);
  if (current) return current;
  const created = { version: 1, updatedAt: Date.now() };
  instanceState.set(id, created);
  return created;
}

function getClientsMap(instanceId, createIfMissing = false) {
  const id = normalizeInstanceId(instanceId);
  if (!id) return null;
  const current = instanceClients.get(id);
  if (current || !createIfMissing) return current || null;
  const created = new Map();
  instanceClients.set(id, created);
  return created;
}

function writeSse(res, eventName, payload) {
  const serialized = JSON.stringify(payload);
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${serialized}\n\n`);
}

function removeClient(instanceId, clientId) {
  const clients = getClientsMap(instanceId, false);
  if (!clients) return;
  const client = clients.get(clientId);
  if (!client) return;

  if (client.heartbeat) {
    clearInterval(client.heartbeat);
  }

  clients.delete(clientId);
  if (clients.size === 0) {
    instanceClients.delete(normalizeInstanceId(instanceId));
  }
}

export function getCheckedInvalidationState(instanceId) {
  const id = normalizeInstanceId(instanceId);
  if (!id) {
    return { instanceId: null, version: 0, updatedAt: null };
  }
  const state = ensureState(id);
  return {
    instanceId: id,
    version: state?.version || 0,
    updatedAt: state?.updatedAt || null,
  };
}

export function publishCheckedInvalidation(instanceId, reason = "checked_updated") {
  const id = normalizeInstanceId(instanceId);
  if (!id) return null;

  const current = ensureState(id);
  current.version += 1;
  current.updatedAt = Date.now();

  const payload = {
    instanceId: id,
    version: current.version,
    updatedAt: current.updatedAt,
    reason: String(reason || "checked_updated"),
  };

  const clients = getClientsMap(id, false);
  if (clients) {
    for (const { res } of clients.values()) {
      writeSse(res, "checked.invalidate", payload);
    }
  }

  return payload;
}

export function registerCheckedInvalidationClient(instanceId, res) {
  const id = normalizeInstanceId(instanceId);
  if (!id) {
    throw new Error("registerCheckedInvalidationClient: instanceId requerido");
  }

  const state = ensureState(id);
  const clients = getClientsMap(id, true);
  const clientId = randomUUID();

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const initialPayload = {
    instanceId: id,
    version: state.version,
    updatedAt: state.updatedAt,
    reason: "stream_connected",
  };
  writeSse(res, "checked.ready", initialPayload);

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 25000);

  clients.set(clientId, { res, heartbeat });

  return () => {
    removeClient(id, clientId);
  };
}
