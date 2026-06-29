# Docker startup

## One-command start

Use this command from the repository root:

```powershell
.\tools\Start-Patrol360.ps1
```

For a double-click Windows launch, use:

```powershell
.\Start-Patrol360.cmd
```

The script does the full normal local start:

1. Builds fresh frontend assets with `npm run build --prefix apps\web`.
2. Builds the Docker web image from local `apps\web\dist`.
3. Starts the Docker app profile with the prebuilt web override.
4. Waits for core containers: PostgreSQL, API, web, proxy.
5. Verifies that `http://127.0.0.1:5173/` returns the built Vite app.

After a successful run the app is available at:

```text
http://127.0.0.1:5173/
http://192.168.2.194:5173/
```

## Why this script exists

The regular Docker web build uses `apps/web/Dockerfile`, which depends on pulling external base images such as `node:22-alpine` and `nginx:1.27-alpine`. When Docker Hub or the network is unstable, that path can fail before the app is even built.

The prebuilt path first builds the web app locally and then packages `apps\web\dist` into the web container. This keeps the UI fresh and avoids the common problem where Docker continues serving old frontend assets.

## Useful options

Skip the local web build only when `apps\web\dist` is already fresh:

```powershell
.\tools\Start-Patrol360.ps1 -SkipWebBuild
```

Skip rebuilding API/worker service images during `docker compose up`:

```powershell
.\tools\Start-Patrol360.ps1 -SkipServiceBuild
```

Force a no-cache rebuild of the prebuilt web image:

```powershell
.\tools\Start-Patrol360.ps1 -NoCache
```

## Manual equivalent

The script replaces this manual sequence:

```powershell
npm run build --prefix apps\web
docker compose -f compose.yaml -f infra/docker/compose.web-prebuilt.yaml --profile app build web
docker compose -f compose.yaml -f infra/docker/compose.web-prebuilt.yaml --profile app up -d --build
```

Use the script by default so the Docker web container does not accidentally serve stale assets.
