@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Start-Patrol360.ps1" %*
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
  echo Patrol360 start failed with exit code %EXITCODE%.
) else (
  echo Patrol360 started successfully.
)

pause
exit /b %EXITCODE%
