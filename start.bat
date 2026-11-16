@echo off
rem Suv ombor veb-xaritasini ishga tushiradi va brauzerda ochadi
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js topilmadi. https://nodejs.org dan o'rnating. & pause & exit /b 1)
rem Server allaqachon ishlayotgan bo'lsa, faqat brauzer ochiladi
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:8080/).StatusCode | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 goto open
start "Suv ombor xaritasi (server)" /min node server.mjs
ping -n 3 127.0.0.1 >nul
:open
start "" http://localhost:8080
exit /b 0
