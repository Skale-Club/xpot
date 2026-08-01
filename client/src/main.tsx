import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "./components/ui/toaster";
import "./index.css";

declare global {
  interface Window {
    // Set once React paints; read by the boot watchdog in index.html.
    __XPOT_BOOTED?: boolean;
  }
}

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>
);

// Service worker: offline shell for the installed PWA (see client/public/sw.js).
// Production only — in dev it would sit in front of Vite's HMR, so any worker
// left over from a production visit on the same origin gets torn down instead.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    });
  } else {
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.unregister()))
      .catch(() => undefined);
  }
}

// Remove the pre-React loader once React has painted its first frame. Setting
// __XPOT_BOOTED here disarms the boot watchdog in index.html — if this never
// runs, the watchdog swaps the loader for a retry screen.
requestAnimationFrame(() => {
  window.__XPOT_BOOTED = true;
  const loader = document.getElementById("initial-loader");
  if (loader) {
    loader.classList.add("loader-fade-out");
    setTimeout(() => loader.remove(), 200);
  }
});
