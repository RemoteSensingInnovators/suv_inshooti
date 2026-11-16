@echo off
rem Suv ombor veb-xaritasi serverini to'xtatadi
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }; Write-Host 'Server toxtatildi.' } else { Write-Host 'Server ishlamayapti.' }"
ping -n 3 127.0.0.1 >nul
