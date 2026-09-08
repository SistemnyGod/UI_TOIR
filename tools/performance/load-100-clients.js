import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const configuration = JSON.parse(open(__ENV.PATROL360_PERF_CONFIG));
const webToken = configuration.webTokens[__VU % configuration.webTokens.length];
const mobileActor = configuration.mobileActors[__VU % configuration.mobileActors.length];
const apiBaseUrl = configuration.apiBaseUrl.replace(/\/$/, "");
const contourId = configuration.contourId;
const photoBytes = configuration.photoPath ? open(configuration.photoPath, "b") : null;

export const options = {
  scenarios: {
    web: {
      executor: "ramping-vus",
      exec: "webFlow",
      startVUs: 0,
      stages: [
        { duration: "5m", target: 5 },
        { duration: "5m", target: 12 },
        { duration: "5m", target: 25 },
        { duration: "5m", target: 50 },
        { duration: "5m", target: 50 },
        { duration: "30m", target: 50 },
      ],
      gracefulRampDown: "30s",
    },
    mobile: {
      executor: "ramping-vus",
      exec: "mobileFlow",
      startVUs: 0,
      stages: [
        { duration: "5m", target: 5 },
        { duration: "5m", target: 12 },
        { duration: "5m", target: 25 },
        { duration: "5m", target: 50 },
        { duration: "5m", target: 50 },
        { duration: "30m", target: 50 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.001"],
    "http_req_duration{kind:read}": ["p(95)<500"],
    "http_req_duration{kind:command}": ["p(95)<1000"],
    "http_req_duration{kind:bootstrap}": ["p(95)<2000"],
  },
};

const contentReady = new Trend("web_content_ready_ms", true);
const unexpectedErrors = new Rate("unexpected_errors");
const webHeaders = token => ({ headers: { Authorization: `Bearer ${token}` }, tags: { kind: "read" } });
const mobileHeaders = token => ({ headers: { Authorization: `Bearer ${token}` }, tags: { kind: "bootstrap" } });

export function webFlow() {
  const started = Date.now();
  const token = webToken;
  const responses = http.batch([
    ["GET", `${apiBaseUrl}/api/v1/inventory/items?page=1&pageSize=50&query=perf`, null, webHeaders(token)],
    ["GET", `${apiBaseUrl}/api/v1/emu/work-sessions?page=1&pageSize=50`, null, webHeaders(token)],
    ["GET", `${apiBaseUrl}/api/v1/patrol-requests?page=1&pageSize=50&query=perf`, null, webHeaders(token)],
  ]);
  const ok = responses.every(response => check(response, { "web response is successful": value => value.status === 200 }));
  unexpectedErrors.add(!ok);
  contentReady.add(Date.now() - started);
  sleep(3 + ((__VU + __ITER) % 6));
}

export function mobileFlow() {
  const bootstrap = http.get(`${apiBaseUrl}/api/v1/mobile/bootstrap`, mobileHeaders(mobileActor.token));
  const bootstrapOk = check(bootstrap, { "mobile bootstrap is successful": value => value.status === 200 });
  unexpectedErrors.add(!bootstrapOk);

  if (__ITER === 0 && photoBytes && mobileActor.fileTarget) {
    for (const clientFileId of mobileActor.fileTarget.clientFileIds) {
      const form = {
        contourId,
        clientFileId,
        workTaskId: mobileActor.fileTarget.workTaskId,
        sha256: mobileActor.fileTarget.sha256,
        sizeBytes: String(mobileActor.fileTarget.sizeBytes),
        capturedAtLocal: new Date().toISOString(),
        file: http.file(photoBytes, "perf-photo.jpg", "image/jpeg"),
      };
      const upload = http.post(`${apiBaseUrl}/api/v1/mobile/files`, form, {
        headers: { Authorization: `Bearer ${mobileActor.token}` }, tags: { kind: "command" },
      });
      const uploadOk = check(upload, { "mobile photo is accepted": value => value.status === 200 });
      unexpectedErrors.add(!uploadOk);
    }
  }

  const outbox = http.post(`${apiBaseUrl}/api/v1/mobile/outbox`, JSON.stringify({ contourId, commands: mobileActor.outboxCommands }), {
    headers: { Authorization: `Bearer ${mobileActor.token}`, "Content-Type": "application/json" },
    tags: { kind: "command" },
  });
  const outboxOk = check(outbox, { "mobile outbox is accepted": value => value.status === 200 });
  unexpectedErrors.add(!outboxOk);
  sleep(3 + ((__VU + __ITER) % 6));
}
