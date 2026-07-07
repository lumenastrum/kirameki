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

set "KIRAMEKI_WORKSPACE=*"
set "KIRAMEKI_WEB_PORT=%WEB_PORT%"

echo Starting Kirameki (mission control: all workspaces)
echo UI:        http://localhost:%WEB_PORT%
echo Relay:     http://127.0.0.1:3001/events
echo.

corepack pnpm run dev

echo.
echo Kirameki stopped.
pause
