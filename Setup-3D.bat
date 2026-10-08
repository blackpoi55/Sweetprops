@echo off
chcp 65001 >nul
title Sweetprops - ติดตั้งตัวสร้าง 3D ในเครื่อง
cd /d "%~dp0"
echo จะติดตั้ง TripoSR (ฟรี) ลงโฟลเดอร์ local3d ดาวน์โหลดประมาณ 2.5GB
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\local3d\setup.ps1"
pause
