import React, { createElement, lazy } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../client/src/i18n";
import { AppLayout } from "../client/src/components/xpot/AppLayout";
import { MobileTabBar } from "../client/src/components/xpot/MobileTabBar";
import { MapPin } from "lucide-react";

describe("screen loading boundaries", () => {
  it.each(["/leads", "/tags/pieces", "/admin/work/tasks"])("keeps navigation outside the loading content at %s", (path) => {
    // Vitest uses the classic JSX transform; the production Vite plugin uses automatic JSX.
    vi.stubGlobal("React", React);
    const client = new QueryClient();
    client.setQueryData(["/api/xpot/me"], {
      user: { id: "review", email: "review@example.test", firstName: "Review", isAdmin: true },
      rep: { id: 1, displayName: "Review", role: "rep", modules: ["visits", "tags"] },
      organizations: [], activeVisit: null,
    });
    const Pending = lazy(() => new Promise<{ default: () => null }>(() => {}));
    try {
      const html = renderToString(createElement(QueryClientProvider, { client },
        createElement(I18nProvider, null, createElement(Router, { ssrPath: path },
          createElement(AppLayout, {
            title: "Review",
            mobileNav: createElement(MobileTabBar, { module: "visits", tabs: [{ id: "leads", label: "Companies", icon: MapPin }], activeId: "leads", onSelect: () => {} }),
            children: createElement(Pending),
          }),
        )),
      ));
      const mainStart = html.indexOf('<main id="xpot-main-content"');
      const mainEnd = html.indexOf("</main>", mainStart);
      expect(mainStart).toBeGreaterThan(html.indexOf('data-testid="desktop-sidebar"'));
      expect(html.slice(mainStart, mainEnd)).toContain('data-testid="screen-loader"');
      expect(html.slice(mainStart, mainEnd)).not.toContain("fixed inset-0");
      expect(html.slice(mainEnd)).toContain("data-hide-on-keyboard");
    } finally {
      client.clear();
      vi.unstubAllGlobals();
    }
  });
});
