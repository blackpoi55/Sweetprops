@echo off
chcp 65001 >nul
title Sweetprops
cd /d "%~dp0"
where node >nul 2>nul || (echo ต้องติดตั้ง Node.js 20 ขึ้นไปก่อน: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo กำลังติดตั้งครั้งแรก... & call npm install --omit=dev || (pause & exit /b 1))
node server\index.js
pause
