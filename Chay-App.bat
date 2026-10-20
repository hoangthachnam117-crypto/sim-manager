@echo off
title SIM Manager - Quan Ly SIM So Dep
cd /d "%~dp0"
echo ==============================================
echo   DANG KHOI DONG HE THONG QUAN LY SIM
echo ==============================================
echo.
echo May tinh truy cap: http://localhost:3000
echo Dien thoai truy cap cung Wi-Fi: http://%COMPUTERNAME%:3000 hoac qua IP LAN
echo.
start http://localhost:3000
node server.js
pause
