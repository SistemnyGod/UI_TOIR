# Security Review: Patrol360 mobile application

## Scope

Risk-prioritized scoped mobile audit with nine deep-review shards.

- Scan mode: scoped_path
- Target kind: git_worktree
- Target ID: patrol360-mobile
- Revision: 60e773d544a3d08009b6deedcffc4434186122f7
- Snapshot digest: codex-security-snapshot/v1:sha256:4127e75526caabc4b38dc2f3c50e303809149ad49dee22d9e301407410fedb5c
- Inventory strategy: scoped_path
- Included paths: mobiel proekt
- Excluded paths: mobiel proekt/node_modules, mobiel proekt/.expo, mobiel proekt/build-output
- Runtime or test status: Static plus repository test validation; no APK/Docker build.
- Artifacts reviewed: rank_input.jsonl, rank_output.jsonl, deep_review_input.jsonl, work_ledger.jsonl, raw_candidates.jsonl
- Scan context: Mobile app only; server enforcement/deployment is a proof gap.

Limitations and exclusions:
- No native SQLite integration harness
- No Android E2E or two-contour runtime fixture
- Server-side refresh/device proof not in scope
- Excluded mobiel proekt/.tmp/\*\*: Ignored/generated build copies are not included by official build-apk.ps1.
- Excluded mobiel proekt/node_modules/\*\*: Third-party dependency installation tree; behavior assessed through manifests and tests.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable DSS findings | 4 |
| Report instances | 4 |
| Report severity mix | high: 2, medium: 2 |
| Report confidence mix | high: 4 |
| Coverage | partial |
| Validation mode | focused static tracing and existing tests |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Protect credentials, mobile sessions, local patrol data, evidence files, and contour isolation across offline/online sync.

### Assets

- access/refresh tokens
- patrol reports and media
- local SQLite/outbox state
- release signing material

### Trust Boundaries

- mobile app to LAN/API
- authenticated user to local SQLite
- build workspace to release artifact

### Attacker Capabilities

- same-LAN observer
- authenticated user with crafted local IDs
- physical/rooted-device extraction is conditional

### Security Objectives

- no wrong-contour transmission
- owner-bound local reads/writes
- reliable offline queue
- confidential transport

## Findings

| Findings | Reports | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- | --- |
| Point metadata/results can be read without owner binding | [mobile-patrol-point-read-owner-bypass](#finding-1) | high | high | mobile-patrol-point-read-owner-bypass: inline below |
| Credential-bearing mobile traffic can use cleartext LAN HTTP | [mobile-cleartext-lan-token-transport](#finding-2) | high | high | mobile-cleartext-lan-token-transport: inline below |
| Large or unknown-size media can exhaust device memory during preparation | [mobile-media-size-unbounded](#finding-3) | medium | high | mobile-media-size-unbounded: inline below |
| Patrol lifecycle queries bind an extra contour parameter | [mobile-sql-parameter-count-mismatch](#finding-4) | medium | high | mobile-sql-parameter-count-mismatch: inline below |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Point metadata/results can be read without owner binding

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Exact source/control/sink trace with repository and test evidence; native runtime proof is recorded as a limitation. |
| Category | authorization |
| CWE | CWE-639, CWE-862 |
| Affected lines | mobiel proekt/src/db/repositories/patrolRepository.ts:525-567, mobiel proekt/src/db/repositories/patrolRepository.ts:886-942, mobiel proekt/src/features/patrol/PointDetailScreen.tsx:27 |

#### Summary

listAssignmentPoints and getPointForFill accept assignmentId/pointId and query local assignment/point rows without requireOwnerUserId or owner/contour predicates. A reachable local route with another assignment ID can disclose another owner's cached patrol state and evidence references.

#### Root Cause

Require the current owner and contour in every point read, join through an owner/contour-bound assignment, and add a two-account SQLite integration test covering forged assignment/point IDs.

#### Validation

Exact source/control/sink trace with repository and test evidence; native runtime proof is recorded as a limitation. Validation details were not recorded separately.

#### Dataflow

The canonical finding records the affected path at mobiel proekt/src/db/repositories/patrolRepository.ts:525-567, mobiel proekt/src/db/repositories/patrolRepository.ts:886-942, mobiel proekt/src/features/patrol/PointDetailScreen.tsx:27, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — listAssignmentPoints and getPointForFill accept assignmentId/pointId and query local assignment/point rows without requireOwnerUserId or owner/contour predicates. A reachable local route with another assignment ID can disclose another owner's cached patrol state and evidence references.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Require the current owner and contour in every point read, join through an owner/contour-bound assignment, and add a two-account SQLite integration test covering forged assignment/point IDs.

<a id="finding-2"></a>

### [2] Credential-bearing mobile traffic can use cleartext LAN HTTP

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Exact source/control/sink trace with repository and test evidence; native runtime proof is recorded as a limitation. |
| Category | transport security |
| CWE | CWE-319, CWE-522 |
| Affected lines | mobiel proekt/app.config.js:86-103, mobiel proekt/src/core/environments.ts:28-33, mobiel proekt/src/api/authApi.ts:25-47, mobiel proekt/src/api/httpClient.ts:136-150 |

#### Summary

local-enterprise/dev configuration permits HTTP to 192.168.2.194 while login, refresh, bearer and media requests carry secrets. A same-LAN attacker can capture credentials or alter queued report traffic. The risk is conditional on deploying this contour on an untrusted Wi-Fi; production HTTPS is a counterexample.

#### Root Cause

Require HTTPS (or a pinned trusted internal certificate/VPN) for credential-bearing traffic. Keep the LAN contour out of production and add a release assertion that cleartext is impossible in production APKs.

#### Validation

Exact source/control/sink trace with repository and test evidence; native runtime proof is recorded as a limitation. Validation details were not recorded separately.

#### Dataflow

The canonical finding records the affected path at mobiel proekt/app.config.js:86-103, mobiel proekt/src/core/environments.ts:28-33, mobiel proekt/src/api/authApi.ts:25-47, mobiel proekt/src/api/httpClient.ts:136-150, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — local-enterprise/dev configuration permits HTTP to 192.168.2.194 while login, refresh, bearer and media requests carry secrets. A same-LAN attacker can capture credentials or alter queued report traffic. The risk is conditional on deploying this contour on an untrusted Wi-Fi; production HTTPS is a counterexample.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Require HTTPS (or a pinned trusted internal certificate/VPN) for credential-bearing traffic. Keep the LAN contour out of production and add a release assertion that cleartext is impossible in production APKs.

<a id="finding-3"></a>

### [3] Large or unknown-size media can exhaust device memory during preparation

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Exact source/control/sink trace with repository and test evidence; native runtime proof is recorded as a limitation. |
| Category | availability |
| CWE | CWE-400, CWE-770 |
| Affected lines | mobiel proekt/src/services/mediaAttachmentService.ts:13-445, mobiel proekt/src/services/fileStorageService.ts:64-65, mobiel proekt/src/sync/fileUploadQueue.ts:35-40 |

#### Summary

Video preparation reads the entire file as Base64 and then materializes decoded bytes for hashing. Unknown-size assets can bypass the 25 MiB check and multi-selection has no aggregate cap, making memory and storage pressure likely before sync.

#### Root Cause

Use streaming/native SHA-256 and multipart file streams, enforce a hard size/count/aggregate quota before copy, and reject unknown-size media instead of treating it as acceptable.

#### Validation

Exact source/control/sink trace with repository and test evidence; native runtime proof is recorded as a limitation. Validation details were not recorded separately.

#### Dataflow

The canonical finding records the affected path at mobiel proekt/src/services/mediaAttachmentService.ts:13-445, mobiel proekt/src/services/fileStorageService.ts:64-65, mobiel proekt/src/sync/fileUploadQueue.ts:35-40, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Medium** — Video preparation reads the entire file as Base64 and then materializes decoded bytes for hashing. Unknown-size assets can bypass the 25 MiB check and multi-selection has no aggregate cap, making memory and storage pressure likely before sync.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Use streaming/native SHA-256 and multipart file streams, enforce a hard size/count/aggregate quota before copy, and reject unknown-size media instead of treating it as acceptable.

<a id="finding-4"></a>

### [4] Patrol lifecycle queries bind an extra contour parameter

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Exact source/control/sink trace with repository and test evidence; native runtime proof is recorded as a limitation. |
| Category | correctness/availability |
| CWE | CWE-248, CWE-754 |
| Affected lines | mobiel proekt/src/db/repositories/patrolRepository.ts:1368-1372, mobiel proekt/src/db/repositories/patrolRepository.ts:1397-1403, mobiel proekt/src/db/repositories/patrolRepository.ts:1442-1447, mobiel proekt/src/db/repositories/patrolRepository.ts:1487-1493 |

#### Summary

Four patrol lifecycle queries contain two SQL placeholders but pass ownerUserId, assignmentId and currentContourId. Expo SQLite can reject the bind with SQLITE_RANGE, blocking assignment reads and start/pause/resume/handoff workflows.

#### Root Cause

Make SQL placeholders and bind arrays match exactly, add contour predicates where intended, and add a native SQLite integration test for every lifecycle action.

#### Validation

Exact source/control/sink trace with repository and test evidence; native runtime proof is recorded as a limitation. Validation details were not recorded separately.

#### Dataflow

The canonical finding records the affected path at mobiel proekt/src/db/repositories/patrolRepository.ts:1368-1372, mobiel proekt/src/db/repositories/patrolRepository.ts:1397-1403, mobiel proekt/src/db/repositories/patrolRepository.ts:1442-1447, mobiel proekt/src/db/repositories/patrolRepository.ts:1487-1493, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Medium** — Four patrol lifecycle queries contain two SQL placeholders but pass ownerUserId, assignmentId and currentContourId. Expo SQLite can reject the bind with SQLITE_RANGE, blocking assignment reads and start/pause/resume/handoff workflows.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Make SQL placeholders and bind arrays match exactly, add contour predicates where intended, and add a native SQLite integration test for every lifecycle action.

## Structural Hardening

The scan also produced derived, unsealed design guidance based on the complete finding collection. These proposals describe options and tradeoffs; they do not indicate that any finding has been remediated.

[Open the structural hardening portfolio](hardening/hardening.md)

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Authentication, refresh and offline session | session security | Needs follow-up | Client hardware proof and server rotation remain unverified. Evidence: artifacts/05_findings/mobile-refresh-bearer-device-binding/candidate_ledger.jsonl, artifacts/05_findings/validation_summary.md |
| HTTP transport and server failover | credential confidentiality | Reported | Local-enterprise HTTP path is reportable conditionally. Evidence: artifacts/05_findings/mobile-cleartext-lan-token-transport/candidate_ledger.jsonl, artifacts/05_findings/mobile-cleartext-lan-token-transport/attack_path_analysis_report.md |
| Media preparation, storage and upload | availability | Reported | Base64 memory amplification and unbounded selection are reportable. Evidence: artifacts/05_findings/mobile-media-size-unbounded/candidate_ledger.jsonl, artifacts/05_findings/mobile-media-size-unbounded/attack_path_analysis_report.md |
| Patrol point reads and actions | local object authorization | Reported | Point reads lack owner binding. Evidence: artifacts/05_findings/mobile-patrol-point-read-owner-bypass/candidate_ledger.jsonl, artifacts/05_findings/mobile-patrol-point-read-owner-bypass/attack_path_analysis_report.md |
| SQLite contour isolation and query correctness | data isolation and sync availability | Needs follow-up | SQL arity is reportable; contour schema/key collision needs two-contour runtime proof. Evidence: artifacts/05_findings/mobile-sql-parameter-count-mismatch/candidate_ledger.jsonl, artifacts/05_findings/mobile-contour-schema-key-collision/candidate_ledger.jsonl |
| Outbox, idempotency and response validation | sync integrity | No issue found | Current source validates responses and owner/contour applies; stale generated copies suppressed. Evidence: artifacts/05_findings/mobile-outbox-response-validation/candidate_ledger.jsonl, artifacts/05_findings/validation_summary.md |
| Generated and ignored build copies | artifact provenance | Not applicable | Official build excludes .tmp; generated candidates were suppressed. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/02_discovery/raw_candidates.jsonl |
| Automated policy/type/lint/encoding checks | verification | No issue found | 57 tests, encoding, typecheck and lint pass; native SQLite/E2E gaps remain. Evidence: artifacts/03_coverage/repository_coverage_ledger.md |

## Open Questions And Follow Up

- Does the deployed local-enterprise Wi-Fi count as trusted, or must tokens be protected against any same-LAN observer?
  - Follow-up prompt: Require TLS/VPN/pinning unless the network trust boundary is explicit.
- Are assignment/task/point IDs globally unique across contours on the server?
  - Follow-up prompt: Run a two-contour fixture and enforce composite contour keys locally.
- Server rotation and hardware-proof enforcement were outside mobile scope.
  - Follow-up prompt: Review deferred unit mobile-refresh-bearer-device-binding and close its stated proof gap. Surfaces: auth-refresh.
- Need server ID uniqueness and a two-contour SQLite fixture.
  - Follow-up prompt: Review deferred unit mobile-contour-schema-key-collision and close its stated proof gap. Surfaces: sqlite.
- Ignored local signing files require deployment/ACL proof.
  - Follow-up prompt: Review deferred unit mobile-release-signing-dpapi-shard09 and close its stated proof gap. Surfaces: release-boundary.
- No native SQLite/Android E2E harness was run.
  - Follow-up prompt: Review deferred unit native-sqlite-e2e and close its stated proof gap. Surfaces: sqlite, tests.
