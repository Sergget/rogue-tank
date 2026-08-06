@echo off
rem Rogue Tank dev server launcher — double-click this file (or run `npm start`).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found on PATH. Install Node.js 18+ first.
  pause
  exit /b 1
)
node server.js
pause
