# Patrol360 mobile e2e (Maestro)

End-to-end check of the main patrol path on a real Android build:

| Flow | What it does | Network |
|---|---|---|
| `01-login.yaml` | Clean app state, sign in with the mock's test account, request board shows «E2E маршрут» | online |
| `02-start-patrol.yaml` | Opens the accepted request and starts the patrol, reaching the NFC scan screen | online |
| `03-manual-point-ok.yaml` | Point 1: «Метка недоступна», reason «Метка повреждена», «Продолжить», «Исправно», save | online |
| `04-faulty-point.yaml` | Point 2: same manual path, «Неисправно» with a description, save, report check screen | online |
| `05-offline-submit.yaml` | Submits the report while offline. Expects «Продолжить работу» in the dialog and the «Отчёт сохранён…» state, never «Отчёт доставлен» | **offline** |
| `06-online-delivered.yaml` | Network back, no taps. Waits up to 120 s for «Отчёт доставлен» | online |

After flow 06, `run-e2e.ps1` also asks the mock (`GET /__e2e/state`) whether the server really received `completePatrolAssignment`.

The flows depend on each other's state, so run them in order through `run-e2e.ps1`.

**Last verified:** 2026-10-19 on `claude/mobile-e2e-maestro-ce60ff`, which includes the `claude/dreamy-turing-7fa3a3` merge at 16523a4.
- Setup: AVD `Patrol360_API36` (API 36.1, x86_64, Google Play image) with Maestro 2.11.0.
- Result: flows 01–06 and the server-side check all passed.
- The mock received `startPatrolAssignment`, `markPatrolPointOk`, `markPatrolPointIssue` and `completePatrolAssignment`. The last one arrived about 1.5 s after the network came back.

## Why a mock backend, and the `e2e` build environment

- **No real server is involved.** `mock-server/server.mjs` is a small stateful Node server.
  - It implements health, login/refresh, bootstrap, the outbox (idempotent by `clientOperationId`) and receipt lookup.
  - It stubs the background calls: app-update, notifications, work items, diagnostics, reports.
  - Its seed data is in `mock-server/fixture.mjs`: one employee, one accepted request, and a two-point route with `nfcEnabled: true`.
  - The test credentials `e2e.patrol` / `e2e-patrol-pass` exist only there.
  - It binds to `127.0.0.1` only. The emulator reaches it as `10.0.2.2`, and the LAN cannot reach it.
- **The APK must be built with `PATROL360_ENVIRONMENT=e2e`.**
  - The `dev` and `local-enterprise` builds always keep `192.168.2.194` (the LAN pilot server) in their server failover list, so a failing mock could silently fall over to the pilot.
  - The `e2e` environment allows exactly one base URL (`PATROL360_PUBLIC_API_URL`), uses contour `patrol360-e2e`, and permits cleartext only to that host.
  - `app.config.js` refuses `e2e` for Release builds and refuses it without `PATROL360_PUBLIC_API_URL`.
- **About the full Docker stack:** `compose.yaml`, `infra/docker/compose.yaml` and `Start-Patrol360.cmd` start the real API, web, proxy and Postgres.
  - The stack uses fixed container names and host ports 80, 443 and 5173.
  - On the server machine, that stack *is* the running pilot. Starting a second copy there would collide with it.
  - Use it for e2e only on a separate developer machine. To do that, build the APK with `PATROL360_PUBLIC_API_URL` pointing at that machine and create a test user and request through the web panel.
  - The flows assume the fixture's route and point names («E2E маршрут», «E2E насос 1», «E2E щит 2»), so they need matching data.

## Setup (Windows)

1. **Maestro CLI.** Install from the official release; it needs Java 17 or newer:
   ```powershell
   # https://github.com/mobile-dev-inc/Maestro/releases (maestro.zip; verify checksums_sha256.txt)
   Expand-Archive maestro.zip -DestinationPath $env:USERPROFILE\.maestro
   & $env:USERPROFILE\.maestro\maestro\bin\maestro.bat --version
   ```
   `run-e2e.ps1` looks for it there. Set `MAESTRO_BIN` to use another location.
2. **Emulator.**
   - Use a dedicated AVD, because the flows wipe app data and cut the emulator's network. The x86_64 API 36 image is fine. Example:
     ```powershell
     & $env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe -avd Patrol360_API36 -port 5556 -no-snapshot-save
     ```
     That makes the serial `emulator-5556`.
   - Avoid the emulator other people are using for manual testing.
3. **Debug APK for the `e2e` environment.** This takes about 10–20 minutes. Run it from `mobiel proekt/`:
   ```powershell
   $env:PATROL360_ANDROID_LOCAL_ROOT_CA = (Resolve-Path ..\infra\docker\certs\patrol360.rootCA.crt).Path
   powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Configuration Debug -AllowDebug `
     -Patrol360Environment e2e -PublicApiBaseUrl http://10.0.2.2:18360 -ReactNativeArchitectures x86_64 `
     -BuildRoot $env:USERPROFILE\.tmp\patrol360-e2e -OutputDirectory build-output-e2e
   ```
   - The separate `-BuildRoot` keeps the build away from other people's builds in `~\.tmp\patrol360`.
   - The JS bundle is embedded (`debuggableVariants = []`), so Metro is not needed.
   - For `e2e` only, the script leaves `expo-dev-client` out of autolinking in the temporary build copy. Otherwise the APK opens the Expo dev launcher instead of the app. Without dev-client, `viewbinding:8.5.2` (requested by the image cropper) does not resolve, so the script pins it to 8.12.0.

## Run

From `mobiel proekt/`:

```powershell
powershell -ExecutionPolicy Bypass -File e2e\run-e2e.ps1 -Device emulator-5556 -Apk build-output-e2e\patrol360-mobile-debug.apk
```

- Omit `-Apk` to keep the installed build. Flow 01 still clears app data.
- `-Only 01-login.yaml,02-start-patrol.yaml` runs a subset. Flows after 01 expect the state the previous flow left.
- Before flow 01, the app is force-stopped and its data cleared while the network is still off. A report queued by an earlier run would otherwise reach the fresh mock and complete the seeded request.
- The device is prepared for the run:
  - Gboard stylus handwriting is turned off, because its onboarding popup swallows typed text.
  - The app is whitelisted from battery optimisation.
  - The flows still dismiss the «Отправка отчётов в фоне» Alert with «Позже».
- Results go to `e2e/reports/` (git-ignored): JUnit XML per flow, Maestro debug output and screenshots, `mock-server.log` and `mock-state.json`.
- The script always restores the emulator network and stops the mock, even when a flow fails.

To run a single flow by hand, start the mock yourself first:

```powershell
node e2e\mock-server\server.mjs --port 18360
maestro --device emulator-5556 test e2e\flows\01-login.yaml
```

## Known limits

- **NFC cannot be simulated on the emulator.** It reports «Телефон не поддерживает NFC», and the flows use the manual «Метка недоступна» path, which is the intended fallback. Tag reads (`ScanNfcScreen` → `scanOutcomeResolver`) are covered by unit tests, not e2e.
- **QR is not covered.**
  - The fixture route has `qrFallbackEnabled: false`.
  - Scanning would need the emulator's virtual-scene camera showing a QR image. That is possible (Extended controls → Camera → virtual scene posters), but too flaky for CI. No test hook was added to the app.
- **Cyrillic input:** Maestro's Android `inputText` does not type non-ASCII text, so the fault description is ASCII. Russian UI text is still asserted.
- **The network is toggled by `adb`**, not by Maestro: `svc wifi/data` plus `cmd connectivity airplane-mode`. The script waits 3 s for NetInfo to notice the change.
- **Java regex `(?i)` is ASCII-only** in Maestro selectors. Match Cyrillic case variants explicitly, for example `"Позже|ПОЗЖЕ"`.
- **Native Alerts hide the screen behind them** from Maestro. Wait for «screen title OR alert button» before you assert on the screen.
- **Photos are not attached.** The app never requires them (`isPhotoEvidenceRequired` is `false`), and camera e2e is out of scope.
- **Server-side behaviour is only as real as the mock.** Contract details are noted inline in `server.mjs`. If the mobile API changes, update the mock together with `src/api/schemas.ts`.

## Stable testIDs

Maestro selects these with `id:`. They are the e2e contract, so keep them when redesigning or splitting screens. If a screen moves, move its testID with the element. Text and accessibility labels are used only where they are what a user would check.

| testID | Where |
|---|---|
| `login-username`, `login-password`, `login-submit` | `src/features/auth/LoginScreen.tsx` |
| `request-card-action` | Request card main button, `RequestBoardScreen.tsx` (both card variants) |
| `patrol-start` | «Начать обход» / «Продолжить обход», `ActivePatrolScreen.tsx` |
| `patrol-primary-action` | Bottom action of an in-progress patrol (scan / all points / submit), `ActivePatrolScreen.tsx` |
| `scan-all-points`, `scan-tag-unavailable` | `ScanActionBar.tsx` (NFC and QR scan screens) |
| `point-manual-continue` | «Продолжить» on the «Метка недоступна» sheet, `PointManualSheet.tsx` |
| `point-status-ok`, `point-status-issue` | Result buttons, `PointStatusTiles.tsx` (`point-status-<status>`) |
| `point-comment` | «Результат осмотра» text field, `PointCommentField.tsx` (its microphone is `point-comment-voice`) |
| `point-save` | «Сохранить и продолжить», `PointFillScreen.tsx` |
| `report-primary-action` | Bottom button of the report check screen, `SubmitReportScreen.tsx` |
| `report-delivery-title` | Delivery state title («Отчёт сохранён…», «Отчёт доставлен»), `SubmitReportScreen.tsx` |

`PrimaryButton` takes an optional `testID` prop for this.
