@echo off
setlocal
title Xpot Desktop setup
echo.
echo  Xpot Desktop lets the Xpot page prepare this computer for printing.
echo  It installs Python if needed, then this small program, and starts with Windows.
echo.

set "APPDIR=%LOCALAPPDATA%\XpotBench"
set "PY="
call :findpython
if not defined PY (
  where winget >nul 2>nul || goto :nowinget
  echo  Installing Python 3.11...
  winget install --id Python.Python.3.11 --exact --scope user --silent --accept-package-agreements --accept-source-agreements
  call :findpython
)
if not defined PY goto :nopython

if not exist "%APPDIR%" mkdir "%APPDIR%"
echo  Downloading Xpot Desktop...
curl.exe -fsSL "https://xpot.place/desktop/desktop.py" -o "%APPDIR%\desktop.py" || goto :nodownload

set "PYW=%PY:python.exe=pythonw.exe%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Xpot Desktop.lnk');$s.TargetPath=$env:PYW;$s.Arguments='\"'+$env:APPDIR+'\desktop.py\"';$s.WorkingDirectory=$env:APPDIR;$s.Save()"
start "" "%PYW%" "%APPDIR%\desktop.py"

echo.
echo  Done. Go back to Xpot: the page now shows what is left to install.
echo.
timeout /t 8 >nul
exit /b 0

:findpython
for %%P in ("%LOCALAPPDATA%\Programs\Python\Python311\python.exe" "%ProgramFiles%\Python311\python.exe") do (
  if exist %%P set "PY=%%~P"
)
exit /b 0

:nowinget
echo  This Windows has no winget, so Python cannot be installed by itself.
echo  Install "App Installer" from the Microsoft Store and run this again.
pause
exit /b 1

:nopython
echo  Python 3.11 did not install. Run this file again, or install it from python.org.
pause
exit /b 1

:nodownload
echo  Could not download Xpot Desktop. Check the connection and run this again.
pause
exit /b 1
