// npm run desktop:installer: builds XpotDesktopSetup.exe (print-pipeline/setup/XpotDesktop.iss) into
// client/public/desktop/, where the dev server and the production build both serve it. Windows only:
//   1. XpotDesktop.exe (print-pipeline/setup/XpotDesktop.cs), what Windows shows for the program, with the C# compiler
//      that comes with Windows (.NET Framework 4);
//   2. the installer, with Inno Setup 6 (winget install --id JRSoftware.InnoSetup -e --scope user).
// The installer .exe is committed: production builds on Linux. Brand images: print-pipeline/setup/make_brand_assets.py.

import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const SETUP = resolve(ROOT, "print-pipeline", "setup");

function run(tool: string, args: string[]) {
  const result = spawnSync(tool, args, { stdio: "inherit", cwd: SETUP });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const windir = process.env.WINDIR ?? "C:\\Windows";
const csc = [join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"), join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe")]
  .find((path) => existsSync(path));
if (!csc) {
  console.error("The C# compiler of .NET Framework 4 was not found (it comes with Windows).");
  process.exit(1);
}
mkdirSync(join(SETUP, "build"), { recursive: true });
run(csc, ["-nologo", "-target:winexe", "-optimize", `-win32icon:${join(SETUP, "xpot.ico")}`, `-out:${join(SETUP, "build", "XpotDesktop.exe")}`, join(SETUP, "XpotDesktop.cs")]);

const iscc = [
  process.env.XPOT_ISCC,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Inno Setup 6", "ISCC.exe"),
  "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
  "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
].filter((path): path is string => !!path).find((path) => existsSync(path));
if (!iscc) {
  console.error("Inno Setup 6 not found. Install it with: winget install --id JRSoftware.InnoSetup -e --scope user");
  process.exit(1);
}
run(iscc, ["/Q", join(SETUP, "XpotDesktop.iss")]);
console.log("Done: client/public/desktop/XpotDesktopSetup.exe");
