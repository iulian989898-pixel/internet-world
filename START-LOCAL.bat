@echo off
title THE INTERNET DECIDES - LOCAL PREVIEW
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Install the LTS release from https://nodejs.org/en/download
  echo Then double-click START-LOCAL.bat again.
  echo.
  pause
  exit /b 1
)
echo.
echo Starting THE INTERNET DECIDES on this computer only...
echo Your browser should open automatically.
echo.
node local-preview.mjs
echo.
echo The preview has stopped.
pause
