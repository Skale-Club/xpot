import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PieceThumb3D, type CatalogModel } from "@/components/xpot/PieceThumb3D";
import { I18nProvider } from "@/i18n";

vi.stubGlobal("React", React);

// The flat drawing is for pieces with no 3D. One whose 3D is still on the way shows a loader, never a second picture.
describe("PieceThumb3D while its picture is on the way", () => {
  const model = { slug: "stand-large-google-black", title: "Large Stand", sha256: "a".repeat(64) } as CatalogModel;

  it("shows the loader and not the fallback", () => {
    const picture = createElement(PieceThumb3D, { model, px: 48, fallback: createElement("i", null, "flat drawing") });
    const html = renderToStaticMarkup(createElement(I18nProvider, null, picture));
    expect(html).toContain("piece-thumb-loading");
    expect(html).not.toContain("flat drawing");
  });
});
