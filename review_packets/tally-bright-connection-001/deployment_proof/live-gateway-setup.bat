@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Bright Connection Tally -> ARTHA live gateway setup

echo ============================================================
echo  BRIGHT CONNECTION TALLY - LIVE GATEWAY SETUP (Windows)
echo  Run this on any PC on the 192.168.0.x LAN (or the Tally PC
echo  itself). Requires Node.js LTS first: https://nodejs.org
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install LTS from https://nodejs.org then re-run.
  exit /b 1
)

cd /d "%~dp0.."

if not exist node_modules (
  echo [1/4] Installing backend dependencies...
  call npm install --no-audit --no-fund
) else (
  echo [1/4] Dependencies already installed.
)

if not exist .env (
  echo [2/4] Creating .env from .env.example...
  copy .env.example .env >nul
  echo   IMPORTANT: open .env and set:
  echo     TALLY_ENABLED=true
  echo     TALLY_HOST=192.168.0.72   (or 127.0.0.1 if running on the Tally PC)
  echo     TALLY_PORT=9000
  echo     TALLY_COMPANY=            (fill after step 3 lists companies)
) else (
  echo [2/4] .env already exists.
)

echo [3/4] Verifying connection to the Tally gateway...
echo   This will list the REAL companies available. Tally must be open
echo   and the gateway must be listening on port 9000.
node scripts/verify-tally-gateway.js

echo.
echo [4/4] You can now:
echo   - Full dealer demo :  node scripts/tally-connect-demo.js --party "<dealer>" --setu
echo   - Start ARTHA API :   npm run dev
echo   - API docs          :  review_packets\tally-bright-connection-001\api_samples\
echo.
pause
