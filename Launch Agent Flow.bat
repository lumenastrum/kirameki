@echo off
setlocal

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "WORKSPACE=%~dp0.."
set "WEB_PORT=3333"

set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
if exist "%BUNDLED_NODE%\node.exe" (
  set "PATH=%BUNDLED_NODE%;%PATH%"
)

cd /d "%ROOT%"

set "AGENT_FLOW_WORKSPACE=%WORKSPACE%"
set "AGENT_FLOW_WEB_PORT=%WEB_PORT%"

echo Starting Agent Flow
echo UI:        http://localhost:%WEB_PORT%
echo Relay:     http://127.0.0.1:3001/events
echo Workspace: %WORKSPACE%
echo.

corepack pnpm run dev

echo.
echo Agent Flow stopped.
pause
