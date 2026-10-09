@echo off
title Xpot Localhost
cd /d "%~dp0"
call npm run local
if errorlevel 1 pause
