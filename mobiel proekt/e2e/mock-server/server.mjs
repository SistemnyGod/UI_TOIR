#!/usr/bin/env node
// Patrol360 e2e mock backend. Implements only the mobile API surface the main
// patrol scenario needs (health, login, bootstrap, outbox) plus harmless stubs
// for the calls the app makes at startup. It keeps state in memory, so every
// run starts from the fixture. Never deploy this anywhere: it accepts the fixed
// test credentials from fixture.mjs and nothing else.
//
//   node e2e/mock-server/server.mjs --port 18360
//
// Test-control endpoints (host only, not used by the app):
//   GET  /__e2e/state   received commands, assignment status, reportReceived
//   POST /__e2e/reset   restore the fixture
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import { createFixture, CONTOUR_ID, TEST_LOGIN, TEST_PASSWORD } from "./fixture.mjs";

const portArgIndex = process.argv.indexOf("--port");
const port = Number(portArgIndex > 0 ? process.argv[portArgIndex + 1] : process.env.PATROL360_E2E_MOCK_PORT ?? 18360);
// Loopback only: the emulator reaches the host loopback as 10.0.2.2, and the
// mock must never be reachable from the LAN (field phones live there).
const host = process.env.PATROL360_E2E_MOCK_HOST ?? "127.0.0.1";

let state = freshState();

function freshState() {
  return { fixture: createFixture(), receipts: new Map(), commands: [], tokens: new Set(), requests: [] };
}

function log(message) {
  process.stdout.write(`${new Date().toISOString()} ${message}\n`);
}

function send(res, status, body) {
  const headers = { "X-Server-Now": new Date().toISOString(), "Cache-Control": "no-store" };
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  res.writeHead(status, { ...headers, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(text); } catch { return null; }
}

function isAuthorized(req) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") && state.tokens.has(header.slice(7));
}

function issueSession() {
  const accessToken = `e2e-access-${randomUUID()}`;
  const refreshToken = `e2e-refresh-${randomUUID()}`;
  state.tokens.add(accessToken);
  const now = Date.now();
  const { user, device } = state.fixture;
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(now + 8 * 3600_000).toISOString(),
    refreshExpiresAt: new Date(now + 30 * 24 * 3600_000).toISOString(),
    contourId: CONTOUR_ID,
    user,
    device
  };
}

function bootstrap() {
  const f = state.fixture;
  return {
    user: f.user,
    device: f.device,
    boundEmployees: f.boundEmployees,
    boundEmployeesComplete: true,
    emuSections: [],
    requestBoard: f.requestBoard,
    assignments: f.assignments,
    routes: f.routes,
    points: f.points,
    patrolPointResultStatusExtension: true,
    serverTime: new Date().toISOString(),
    syncCursor: null,
    contourId: CONTOUR_ID
  };
}

function receipt(command, status, message, extra = {}) {
  return {
    clientOperationId: command.clientOperationId,
    status,
    message,
    serverEntityId: null,
    serverRevision: null,
    conflictId: null,
    retryAfterSeconds: null,
    ...extra
  };
}

function applyCommand(command) {
  const f = state.fixture;
  const payload = command.payload ?? {};
  const assignment = f.assignments.find(item => item.assignmentId === payload.assignmentId);
  const request = assignment ? f.requestBoard.find(item => item.requestId === assignment.requestId) : undefined;
  switch (command.commandType) {
    case "acceptPatrolRequest":
    case "markPatrolPointOk":
    case "markPatrolPointIssue":
      if (!assignment) return receipt(command, "rejected", "Unknown assignment", { reasonCode: "not_found" });
      return receipt(command, "accepted", "ok", { serverEntityId: payload.pointId ?? assignment.assignmentId });
    case "startPatrolAssignment":
      if (!assignment) return receipt(command, "rejected", "Unknown assignment", { reasonCode: "not_found" });
      assignment.status = "inProgress";
      assignment.startedAtLocal = payload.startedAtLocal ?? new Date().toISOString();
      assignment.revision += 1;
      if (request) { request.status = "inProgress"; request.revision += 1; }
      return receipt(command, "accepted", "started", { serverEntityId: assignment.assignmentId });
    case "completePatrolAssignment":
      if (!assignment) return receipt(command, "rejected", "Unknown assignment", { reasonCode: "not_found" });
      assignment.status = "completedServer";
      assignment.completedAtLocal = payload.completedAtLocal ?? new Date().toISOString();
      assignment.revision += 1;
      if (request) { request.status = "completed"; request.revision += 1; }
      f.completedReports.push({ receivedAt: new Date().toISOString(), payload });
      return receipt(command, "accepted", "report stored", { serverEntityId: assignment.assignmentId });
    default:
      // Accept anything else so an unrelated command never blocks the patrol queue,
      // but record it so the run report shows it.
      return receipt(command, "accepted", `mock accepted ${command.commandType}`);
  }
}

async function handle(req, res) {
  const url = new URL(req.url ?? "/", "http://mock");
  const path = url.pathname;
  const method = req.method ?? "GET";
  state.requests.push(`${method} ${path}`);
  log(`${method} ${url.pathname}${url.search}`);

  // ---- test control (never called by the app) ----
  if (path === "/__e2e/state" && method === "GET") {
    const f = state.fixture;
    return send(res, 200, {
      assignments: f.assignments.map(({ assignmentId, status, revision }) => ({ assignmentId, status, revision })),
      commands: state.commands,
      completedReports: f.completedReports,
      reportReceived: f.completedReports.length > 0,
      requestCount: state.requests.length
    });
  }
  if (path === "/__e2e/reset" && method === "POST") {
    state = freshState();
    return send(res, 200, { reset: true });
  }

  // ---- public ----
  if (path === "/api/v1/mobile/health" && method === "GET") {
    return send(res, 200, { status: "ok", syncProtocolVersion: "1.0", contourId: CONTOUR_ID });
  }
  if (path === "/api/v1/mobile/auth/login" && method === "POST") {
    const body = await readJson(req);
    if (!body || body.login !== TEST_LOGIN || body.password !== TEST_PASSWORD) {
      return send(res, 401, { code: "invalid_credentials", message: "Неверный логин или пароль" });
    }
    if (body.deviceId) state.fixture.device.deviceId = body.deviceId;
    return send(res, 200, issueSession());
  }
  if (path === "/api/v1/mobile/auth/refresh" && method === "POST") {
    const body = await readJson(req);
    if (body?.deviceId) state.fixture.device.deviceId = body.deviceId;
    return send(res, 200, issueSession());
  }

  // ---- authorized ----
  if (!isAuthorized(req)) {
    return send(res, 401, { code: "token_expired", message: "Unauthorized" });
  }

  if (path === "/api/v1/mobile/auth/logout" && method === "POST") return send(res, 204);
  if (path === "/api/v1/mobile/bootstrap" && method === "GET") return send(res, 200, bootstrap());

  if (path === "/api/v1/mobile/outbox" && method === "POST") {
    const body = await readJson(req);
    const commands = Array.isArray(body?.commands) ? body.commands : [];
    const receipts = commands.map(command => {
      const previous = state.receipts.get(command.clientOperationId);
      if (previous) return { ...previous, status: "duplicate" };
      const result = applyCommand(command);
      state.receipts.set(command.clientOperationId, result);
      state.commands.push({ clientOperationId: command.clientOperationId, commandType: command.commandType, status: result.status, payload: command.payload });
      log(`  outbox ${command.commandType} -> ${result.status}`);
      return result;
    });
    return send(res, 200, receipts);
  }
  const outboxReceipt = path.match(/^\/api\/v1\/mobile\/outbox\/([^/]+)$/);
  if (outboxReceipt && method === "GET") {
    const stored = state.receipts.get(decodeURIComponent(outboxReceipt[1]));
    return stored ? send(res, 200, stored) : send(res, 404, { code: "not_found" });
  }

  // ---- harmless stubs for startup / background calls ----
  if (path === "/api/v1/mobile/app-update" && method === "GET") return send(res, 404, { code: "no_update" });
  if (path === "/api/v1/mobile/notifications" && method === "GET") return send(res, 200, []);
  if (path === "/api/v1/mobile/devices/push-token" && method === "POST") {
    return send(res, 200, { deviceId: state.fixture.device.deviceId, pushEnabled: false, registeredAt: new Date().toISOString() });
  }
  if (path === "/api/v2/mobile/work-items" && method === "GET") return send(res, 200, []);
  if (path === "/api/v2/mobile/work-items/page" && method === "GET") return send(res, 200, { items: [], nextCursor: null });
  if (path === "/api/v1/mobile/work-tasks" && method === "GET") return send(res, 200, []);
  if (path === "/api/v1/mobile/patrol-appeals" && method === "GET") return send(res, 200, { items: [], nextCursor: null });
  if (path === "/api/v1/mobile/patrol-reports" && method === "GET") {
    return send(res, 200, { items: [], total: 0, page: Number(url.searchParams.get("page") ?? 1), pageSize: Number(url.searchParams.get("pageSize") ?? 20), nextCursor: null });
  }
  if (/^\/api\/v1\/mobile\/patrol-reports\/[^/]+\/points$/.test(path) && method === "GET") return send(res, 200, []);
  if (path === "/api/v1/mobile/diagnostics/daily" && method === "POST") {
    const body = await readJson(req);
    return send(res, 200, { reportId: body?.reportId ?? randomUUID(), status: "stored", storedAt: new Date().toISOString() });
  }

  log(`  unhandled ${method} ${path}`);
  return send(res, 404, { code: "not_found", message: `e2e mock does not implement ${method} ${path}` });
}

const server = createServer((req, res) => {
  handle(req, res).catch(error => {
    log(`  error ${error?.stack ?? error}`);
    send(res, 500, { code: "mock_error", message: String(error) });
  });
});

server.listen(port, host, () => log(`Patrol360 e2e mock listening on http://${host}:${port} (contour ${CONTOUR_ID})`));
