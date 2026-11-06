// XpotDesktop.exe: what Windows shows for Xpot Desktop (Task Manager, Startup apps, Apps & features), with the Xpot
// icon and name instead of Python's. It starts desktop.py, which sits beside it, with Python 3.11 and waits for it, so
// the program and its bench appear nested under "Xpot Desktop". desktop.py stays a plain file that updates itself; after
// an update it starts the new version through this same .exe. Arguments are passed on to desktop.py.
// Built by `npm run desktop:installer` with the C# compiler that comes with Windows (.NET Framework 4), no extra tool.
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;

[assembly: AssemblyTitle("Xpot Desktop")]
[assembly: AssemblyDescription("Xpot Desktop")]
[assembly: AssemblyProduct("Xpot Desktop")]
[assembly: AssemblyCompany("Xpot")]
[assembly: AssemblyCopyright("Xpot")]
[assembly: AssemblyVersion("2.0.0.0")]
[assembly: AssemblyFileVersion("2.0.0.0")]

static class XpotDesktop
{
    static string FindPythonW()
    {
        string[] places =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Python\Python311\pythonw.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Python311\pythonw.exe"),
        };
        return places.FirstOrDefault(File.Exists);
    }

    static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    [STAThread]
    static int Main(string[] args)
    {
        string folder = AppDomain.CurrentDomain.BaseDirectory;
        string script = Path.Combine(folder, "desktop.py");
        string python = FindPythonW();
        if (python == null || !File.Exists(script)) return 1;
        var start = new ProcessStartInfo(python)
        {
            Arguments = string.Join(" ", new[] { Quote(script) }.Concat(args.Select(Quote))),
            WorkingDirectory = folder,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using (var program = Process.Start(start))
        {
            program.WaitForExit();
            return program.ExitCode;
        }
    }
}
