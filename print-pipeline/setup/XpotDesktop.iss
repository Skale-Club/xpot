; Xpot Desktop installer (Inno Setup 6). Builds XpotDesktopSetup.exe, the file the Xpot page offers on Make and on
; Devices: a normal Windows installer (Next, Install, Finish; Apps & features uninstalls it), for the current user only,
; no administrator rights. It installs what desktop.py needs and starts it:
;   - Python 3.11 from python.org when this computer has none (the print code is pinned to 3.11, requirements.txt);
;   - the latest desktop.py from xpot.place (or /SERVER=...), so the installer rarely needs rebuilding;
;   - a "Xpot Desktop" shortcut in the user's Startup folder, then starts it (it sits by the clock, connects through the
;     Xpot page, installs the rest by itself and updates itself: desktop.py).
; Build (Windows): npm run desktop:installer   (writes client/public/desktop/XpotDesktopSetup.exe)
; Unsigned for now: Windows shows "Windows protected your PC" the first time (More info, Run anyway). Signing the same
; .exe later removes it, with no other change.

#define AppName "Xpot Desktop"
; The program updates itself and writes its own version to Apps & features; this is the first one installed.
#define AppVersion "2"
#define PythonUrl "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
; The Xpot it downloads the program from: xpot.place, or another with /SERVER=http://localhost:2110 (a local test).
#define DefaultServer "https://xpot.place"

[Setup]
AppId={{6C1E2D4B-7A8F-4E3B-9C55-1F0A2B3C4D5E}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Xpot
AppPublisherURL=https://xpot.place
AppSupportURL=https://xpot.place
; Brand (make_brand_assets.py draws these from the app's own mark): the .exe, the uninstaller, Apps & features, the pages.
SetupIconFile=xpot.ico
UninstallDisplayIcon={app}\XpotDesktop.exe
WizardImageFile=wizard-large.bmp
WizardSmallImageFile=wizard-small.bmp
VersionInfoCompany=Xpot
VersionInfoProductName=Xpot Desktop
VersionInfoDescription=Xpot Desktop installer
VersionInfoVersion=2.0.0.0
DefaultDirName={localappdata}\XpotBench
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\client\public\desktop
OutputBaseFilename=XpotDesktopSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=auto
UninstallDisplayName={#AppName}
; No pages to click through: opening it installs, then Finish.
DisableWelcomePage=yes

[Languages]
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[CustomMessages]
pt.PythonFailed=Não foi possível instalar o Python. Verifique a conexão e abra este instalador de novo.
en.PythonFailed=Python could not be installed. Check the connection and open this installer again.
es.PythonFailed=No se pudo instalar Python. Revisa la conexión y abre este instalador otra vez.

[Messages]
pt.FinishedLabelNoIcons=Pronto. O Xpot Desktop está aberto, com um ícone perto do relógio do Windows. Volte ao Xpot: a página continua sozinha.
en.FinishedLabelNoIcons=Done. Xpot Desktop is open, with an icon by the Windows clock. Go back to Xpot: the page carries on by itself.
es.FinishedLabelNoIcons=Listo. Xpot Desktop está abierto, con un ícono junto al reloj de Windows. Vuelve a Xpot: la página sigue sola.

[Files]
; XpotDesktop.exe (XpotDesktop.cs) is what Windows shows: it starts desktop.py with Python, under the Xpot name and icon.
Source: "build\XpotDesktop.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "xpot.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Xpot Desktop, not Python, in the Startup folder and Task Manager's Startup apps.
Name: "{userstartup}\{#AppName}"; Filename: "{app}\XpotDesktop.exe"; WorkingDir: "{app}"; Comment: "{#AppName}"

[Run]
Filename: "{app}\XpotDesktop.exe"; WorkingDir: "{app}"; Flags: nowait

[UninstallRun]
; Stops the running Xpot Desktop and its bench (Python processes from the XpotBench folder only) before the folder goes.
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -Command ""Get-CimInstance Win32_Process -Filter \""Name='XpotDesktop.exe' OR Name='pythonw.exe' OR Name='python.exe'\"" | Where-Object {{ $_.CommandLine -like '*\XpotBench\*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }"""; Flags: runhidden; RunOnceId: "StopXpotDesktop"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function PythonExe(): String;
begin
  Result := ExpandConstant('{localappdata}\Programs\Python\Python311\python.exe');
  if FileExists(Result) then Exit;
  Result := ExpandConstant('{commonpf64}\Python311\python.exe');
  if FileExists(Result) then Exit;
  Result := '';
end;

// Downloads happen while "Preparing to install" (also in /SILENT mode): the latest desktop.py, and Python 3.11 when
// missing, installed for this user only, quietly (no administrator, no PATH change, no launcher). A non-empty result
// stops the installer with that message.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Result := '';
  // Installing over a running Xpot Desktop (a reinstall): stop it and its bench, so the new one starts with the new
  // files. Only Python processes running from the XpotBench folder: nothing else that mentions it.
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -Command "Get-CimInstance Win32_Process -Filter ''Name=\"XpotDesktop.exe\" OR Name=\"pythonw.exe\" OR Name=\"python.exe\"'' | Where-Object { $_.CommandLine -like ''*\XpotBench\*'' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
    '', SW_HIDE, ewWaitUntilTerminated, Code);
  try
    DownloadTemporaryFile(ExpandConstant('{param:server|{#DefaultServer}}') + '/desktop/desktop.py', 'desktop.py', '', nil);
    if PythonExe() = '' then
      DownloadTemporaryFile('{#PythonUrl}', 'python-3.11.exe', '', nil);
  except
    Result := AddPeriod(GetExceptionMessage);
    Exit;
  end;
  if PythonExe() = '' then
  begin
    Exec(ExpandConstant('{tmp}\python-3.11.exe'), '/quiet InstallAllUsers=0 PrependPath=0 Include_launcher=0 Include_test=0 Shortcuts=0',
      '', SW_HIDE, ewWaitUntilTerminated, Code);
    if PythonExe() = '' then Result := CustomMessage('PythonFailed');
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    ForceDirectories(ExpandConstant('{app}'));
    FileCopy(ExpandConstant('{tmp}\desktop.py'), ExpandConstant('{app}\desktop.py'), False);
  end;
end;
