import { describe, expect, it } from "vitest";
import {
  materialsForNfc,
  nfcMountsOf,
  preferredNfcMount,
  withNfcVariant,
  bedPosition,
  canMarkPrinted,
  PRINT_ERROR_QR_CHECK,
  isAlwaysReadyPart,
  modelReleased,
  nextPrintBatchCode,
  pickGenerateFace,
  planPrintJobTransition,
  planRedoCodes,
  printGenerateOptions,
  printPartFamilies,
  printPartVariant,
  printedPartBeds,
  printJobStockSchema,
  printJobUpdateSchema,
  printMaterialSchema,
  printMaterialsSchema,
  printModelInputSchema,
  printModelPatchSchema,
  printVersionInputSchema,
  splitPrintedPieces,
  type PrintBed,
  type PrintModelItem,
  type PrintModelVersionItem,
} from "../../shared/printProduction";
import { PRINT_MENU_FONTS, menuFontsOf } from "../../shared/printProduction";

describe("print batch codes", () => {
  it("takes the number after the highest one used this year, and ignores other prefixes and years", () => {
    expect(nextPrintBatchCode("LPLATE", 2026, [])).toBe("LPLATE-2026-001");
    expect(nextPrintBatchCode("LPLATE", 2026, ["LPLATE-2026-001", "LPLATE-2026-006", "LPLATE-2026-004"])).toBe("LPLATE-2026-007");
    expect(nextPrintBatchCode("LPLATE", 2027, ["LPLATE-2026-006"])).toBe("LPLATE-2027-001");
    expect(nextPrintBatchCode("REV", 2026, ["REVX-2026-009", "REV-2026-002"])).toBe("REV-2026-003");
  });
});

describe("print order state machine", () => {
  it("allows the production path and refuses jumps", () => {
    expect(planPrintJobTransition("requested", "claim")).toEqual({ ok: true, status: "building" });
    expect(planPrintJobTransition("building", "complete")).toEqual({ ok: true, status: "ready" });
    expect(planPrintJobTransition("ready", "start")).toEqual({ ok: true, status: "printing" });
    expect(planPrintJobTransition("printing", "printed")).toEqual({ ok: true, status: "printed" });
    expect(planPrintJobTransition("ready", "printed")).toEqual({ ok: true, status: "printed" });
    expect(planPrintJobTransition("building", "release")).toEqual({ ok: true, status: "requested" });
    expect(planPrintJobTransition("requested", "printed")).toEqual({ ok: true, status: "printed" });
    expect(planPrintJobTransition("building", "printed")).toMatchObject({ ok: false, code: "print_job_state" });
    expect(planPrintJobTransition("printed", "cancel")).toMatchObject({ ok: false, error: "A printed print order cannot be cancelled" });
    // A failed plate that will not be printed again is closed with cancel.
    expect(planPrintJobTransition("failed", "cancel")).toEqual({ ok: true, status: "cancelled" });
    expect(planPrintJobTransition("printing", "cancel").ok).toBe(false);
    expect(planPrintJobTransition("failed", "fail").ok).toBe(false);
  });

  it("lets a plate printed by hand without a file be marked printed, but not one a bench is building", () => {
    expect(["requested", "building", "ready", "printing", "printed", "failed", "cancelled"].filter(canMarkPrinted))
      .toEqual(["requested", "ready", "printing"]);
  });
});

describe("printing a plate again", () => {
  it("keeps its codes unless some were received or its QR check failed", () => {
    expect(planRedoCodes({ errorCode: "build_failed", anyReceived: false })).toBe("same");
    expect(planRedoCodes({ errorCode: null, anyReceived: false })).toBe("same");
    expect(planRedoCodes({ errorCode: "failed", anyReceived: true })).toBe("fresh");
  });
  it("gives a plate that failed its QR check fresh codes, since the same ones would fail again", () => {
    expect(PRINT_ERROR_QR_CHECK).toBe("qr_check_failed");
    expect(planRedoCodes({ errorCode: PRINT_ERROR_QR_CHECK, anyReceived: false })).toBe("replace");
    // a received piece's code is taken: a fresh batch, and the received pieces are not retired
    expect(planRedoCodes({ errorCode: PRINT_ERROR_QR_CHECK, anyReceived: true })).toBe("fresh");
  });
});

describe("print schemas", () => {
  const bed = { label: "x4", copies: 4, positions: ["front-left", "front-right", "back-left", "back-right"] };

  it("wants one position per copy and distinct bed labels", () => {
    expect(printVersionInputSchema.safeParse({ beds: [bed] }).success).toBe(true);
    expect(printVersionInputSchema.safeParse({ beds: [{ ...bed, positions: ["front-left"] }] }).success).toBe(false);
    expect(printVersionInputSchema.safeParse({ beds: [bed, { ...bed, label: "X4" }] }).success).toBe(false);
    expect(printVersionInputSchema.safeParse({ beds: [] }).success).toBe(false);
  });

  it("takes one bed slot per copy, each an offset in mm and an optional turn", () => {
    const slots = [{ offset: [-72.5, -53.5] }, { offset: [72.5, -53.5], rotation: 90 }, { offset: [-72.5, 53.5] }, { offset: [72.5, 53.5] }];
    expect(printVersionInputSchema.safeParse({ beds: [{ ...bed, slots }] }).success).toBe(true);
    expect(printVersionInputSchema.safeParse({ beds: [{ ...bed, slots: slots.slice(1) }] }).success).toBe(false);
    expect(printVersionInputSchema.safeParse({ beds: [{ ...bed, slots: [{ offset: [0] }, ...slots.slice(1)] }] }).success).toBe(false);
  });

  it("asks a serialized model for its product, face, colour, sales product and prefix, and not a part", () => {
    expect(printModelInputSchema.safeParse({ slug: "base-large", kind: "part", title: "Base" }).success).toBe(true);
    expect(printModelInputSchema.safeParse({ slug: "plate", kind: "serialized", title: "Plate" }).success).toBe(false);
    const fields = { slug: "Plate-Large-Menu", kind: "serialized", title: "Plate", productType: "large_plate", face: "menu", theme: " White ", salesProductId: 9, batchPrefix: "lplate" };
    const ok = printModelInputSchema.parse(fields);
    expect(ok).toMatchObject({ slug: "plate-large-menu", batchPrefix: "LPLATE", theme: "white" });
    // Without a face or a colour it could never be generated (canGenerateModel): refused at once.
    const { face: _face, ...noFace } = fields;
    const { theme: _theme, ...noTheme } = fields;
    expect(printModelInputSchema.safeParse(noFace).success).toBe(false);
    expect(printModelInputSchema.safeParse(noTheme).success).toBe(false);
    expect(printModelInputSchema.safeParse({ slug: "has spaces", kind: "part", title: "X" }).success).toBe(false);
  });
});

describe("bed positions", () => {
  it("repeats the bed's positions for every plate of an order", () => {
    const bed = { copies: 4, positions: ["front-left", "front-right", "back-left", "back-right"] };
    expect(bedPosition(bed, 1)).toBe("front-left");
    expect(bedPosition(bed, 4)).toBe("back-right");
    expect(bedPosition(bed, 6)).toBe("front-right");
    expect(bedPosition({ copies: 4 }, 2)).toBeNull();
    expect(bedPosition(bed, null)).toBeNull();
  });
});

describe("marking a plate printed", () => {
  const pieces = [
    { publicCode: "AAAA0001", stockStatus: "pending" },
    { publicCode: "AAAA0002", stockStatus: "pending" },
    { publicCode: "AAAA0003", stockStatus: "pending" },
    { publicCode: "AAAA0004", stockStatus: "available" },
  ];

  it("stays backward compatible and takes bad pieces only with printed", () => {
    expect(printJobUpdateSchema.parse({ action: "printed" })).toEqual({ action: "printed" });
    expect(printJobUpdateSchema.parse({ action: "printed", badPieces: [" AAAA0002 "] }).badPieces).toEqual(["AAAA0002"]);
    expect(printJobUpdateSchema.safeParse({ action: "fail", reason: "Lifted", badPieces: ["AAAA0002"] }).success).toBe(false);
    expect(printJobUpdateSchema.safeParse({ action: "fail", reason: "Lifted", badPieces: [] }).success).toBe(true);
    expect(printJobStockSchema.parse({})).toEqual({});
    expect(printJobStockSchema.safeParse({ badPieces: [""] }).success).toBe(false);
  });

  it("puts every pending piece in stock unless it is listed as bad", () => {
    expect(splitPrintedPieces(pieces)).toEqual({ good: ["AAAA0001", "AAAA0002", "AAAA0003"], bad: [], unknown: [] });
    expect(splitPrintedPieces(pieces, ["AAAA0002"])).toEqual({ good: ["AAAA0001", "AAAA0003"], bad: ["AAAA0002"], unknown: [] });
  });

  it("reads codes as typed, leaves non-pending pieces alone and reports a code outside the batch", () => {
    expect(splitPrintedPieces(pieces, ["aaaa-0003"]).bad).toEqual(["AAAA0003"]);
    expect(splitPrintedPieces(pieces, ["AAAA0004"])).toEqual({ good: ["AAAA0001", "AAAA0002", "AAAA0003"], bad: [], unknown: [] });
    expect(splitPrintedPieces(pieces, ["ZZZZ9999", "AAAA0001"])).toEqual({ good: ["AAAA0002", "AAAA0003"], bad: ["AAAA0001"], unknown: ["ZZZZ9999"] });
  });
});

describe("the NFC choice", () => {
  const variants = {
    sticker_10x20: { pause: { z: 1.8, text: "rect" }, consumes: [{ part: "nfc-sticker-10x20", perPiece: 1 }] },
    sticker_round_25: { pause: { z: 2.28, text: "round" }, consumes: [{ part: "nfc-sticker-round-25", perPiece: 1 }], material: { kind: "nfc_sticker" as const, name: "Round", spec: null, supplier: null, url: null, note: null } },
  };

  it("offers the round sticker first and marks it as the default", () => {
    expect(nfcMountsOf(variants)).toEqual(["sticker_round_25", "sticker_10x20"]);
    expect(preferredNfcMount(nfcMountsOf(variants))).toBe("sticker_round_25");
    expect(preferredNfcMount(["embedded_round"])).toBe("embedded_round");
    expect(nfcMountsOf({})).toEqual([]);
    expect(preferredNfcMount([])).toBeNull();
  });

  it("applies one type to the params, recipe, every bed and the parts", () => {
    const version = { params: { size: "large" }, recipe: { pause_top_z: 1.8, _pause: "old", wall_loops: "3" }, beds: [{ label: "x4", copies: 4 }, { label: "x6", copies: 6 }], consumes: [{ part: "base-large", perPiece: 1 }] };
    const printed = withNfcVariant(version, variants, "sticker_round_25");
    expect(printed.params).toEqual({ size: "large", nfc_mount: "sticker_round_25" });
    expect(printed.recipe).toEqual({ pause_top_z: 2.28, wall_loops: "3" });
    expect(printed.beds.map((bed) => bed.pause?.z)).toEqual([2.28, 2.28]);
    expect(printed.consumes).toEqual(variants.sticker_round_25.consumes);
  });

  it("leaves a plate with no type, or a version with no variants, as it is", () => {
    const version = { params: {}, recipe: {}, beds: [], consumes: [] };
    expect(withNfcVariant(version, variants, null)).toBe(version);
    expect(withNfcVariant(version, {}, "sticker_10x20")).toBe(version);
  });

  it("lists the type's sticker instead of the model's, keeping the rest", () => {
    const listed = [{ kind: "nfc_sticker" as const, name: "Old", spec: null, supplier: null, url: null, note: null }, { kind: "filament" as const, name: "White PLA", spec: null, supplier: null, url: null, note: null }];
    expect(materialsForNfc(listed, variants.sticker_round_25).map((m) => m.name)).toEqual(["Round", "White PLA"]);
    expect(materialsForNfc(listed, variants.sticker_10x20).map((m) => m.name)).toEqual(["Old", "White PLA"]);
    expect(materialsForNfc(null, null)).toEqual([]);
  });
});

describe("the Production page's choices", () => {
  const version = (builder: string | null, beds: PrintBed[], preview = false): PrintModelVersionItem => ({
    id: "v", modelId: "m", version: 1, status: "current", builder, params: {}, recipe: {}, beds,
    consumes: [], nfcVariants: {}, changelog: null, fixesBatchId: null, fixesBatchCode: null, source: "mcp", createdAt: "", jobCount: 0,
    preview: preview ? { fileName: "p.glb", bytes: 1, sha256: "a", uploadedAt: "" } : null,
  });
  const model = (over: Partial<PrintModelItem> & { builder?: string | null; preview?: boolean }): PrintModelItem => {
    const { builder = "stand.google", preview = false, ...rest } = over;
    return {
      id: rest.slug ?? "m", slug: "m", kind: "serialized", title: "M", description: null, productType: "large_stand", face: "google_review",
      theme: "white", salesProductId: 7, batchPrefix: "REV", status: "ready", sortOrder: 0, onHand: 0, withResellers: 0, openJobs: 0, materials: [],
      partReorderAt: null, lowStock: false, createdAt: "", updatedAt: "",
      currentVersion: version(builder, [{ label: "x4", copies: 4 }], preview),
      ...rest,
    };
  };

  it("does not offer unapproved body colors or mutate historical model records", () => {
    const previous = model({ slug: "stand-large-google-navy", theme: "Navy" });
    const options = printGenerateOptions([model({ slug: "white" }), model({ slug: "black", theme: "black" }), previous]);
    expect(options[0].colours.map((colour) => colour.theme)).toEqual(["white", "black"]);
    expect(pickGenerateFace(options, { productType: "large_stand", theme: "navy", face: "google_review" })).toBeNull();
    expect(previous.theme).toBe("Navy");
    expect(previous.status).toBe("ready");
  });

  it("offers per product the colours and faces that have a generator, white before black", () => {
    const options = printGenerateOptions([
      model({ slug: "plate-small-google-white", productType: "small_plate", builder: "plate.google" }),
      model({ slug: "stand-large-instagram-black", theme: "black", face: "instagram", preview: true }),
      model({ slug: "stand-large-google-black", theme: "black" }),
      model({ slug: "stand-large-menu-white", face: "menu" }),
      model({ slug: "stand-large-google-white" }),
      model({ slug: "stand-large-venmo-white", face: "venmo", builder: null }),
      model({ slug: "stand-large-tiktok-white", face: "tiktok", status: "design_needed" }),
      model({ slug: "stand-large-retired", face: "facebook", status: "retired" }),
      model({ slug: "base-large", kind: "part", productType: null, face: null, theme: null }),
    ]);
    expect(options.map((o) => o.productType)).toEqual(["large_stand", "small_plate"]);
    expect(options[0].colours.map((c) => [c.theme, c.faces.map((f) => f.slug)])).toEqual([
      ["white", ["stand-large-google-white", "stand-large-menu-white"]],
      ["black", ["stand-large-google-black", "stand-large-instagram-black"]],
    ]);
    expect(options[0].colours[1].faces[1]).toMatchObject({ face: "instagram", copies: 4, bedLabel: "x4", hasPreview: true });

    // A colour typed in another case is the same colour: one group, and the choice finds it.
    const mixedCase = printGenerateOptions([model({ slug: "a", theme: "White" }), model({ slug: "b", theme: "white", face: "menu" })]);
    expect(mixedCase[0].colours.map((c) => [c.theme, c.faces.length])).toEqual([["white", 2]]);
    expect(pickGenerateFace(mixedCase, { productType: "large_stand", theme: "WHITE", face: "google_review" })?.slug).toBe("a");
    expect(pickGenerateFace(options, { productType: "large_stand", theme: "Black", face: "instagram" })?.slug).toBe("stand-large-instagram-black");
    expect(pickGenerateFace(options, { productType: "large_stand", theme: "white", face: "venmo" })).toBeNull();
  });

  it("keeps every menu style and resolves the exact model only inside its face, colour and product", () => {
    const classic = model({ slug: "menu-classic", face: "menu", currentVersion: { ...version("plate.service", [{ label: "x4", copies: 4 }]), params: { style: "classic" } } });
    const italic = model({ slug: "menu-italic", face: "menu", currentVersion: { ...classic.currentVersion!, params: { style: "italic" } } });
    const options = printGenerateOptions([classic, italic, model({ slug: "cashapp", face: "cashapp" }), model({ slug: "paypal", face: "paypal" }), model({ slug: "zelle", face: "zelle" }), model({ slug: "wifi", face: "wifi" })]);
    const menu = options[0].colours[0].faces.find((face) => face.face === "menu")!;
    expect(menu.styles?.map((style) => [style.slug, style.style])).toEqual([["menu-classic", "classic"], ["menu-italic", "italic"]]);
    const input = { productType: "large_stand", theme: "white", face: "menu" };
    expect(pickGenerateFace(options, { ...input, modelSlug: "menu-italic" })?.slug).toBe("menu-italic");
    expect(pickGenerateFace(options, { ...input, modelSlug: "cashapp" })).toBeNull();
    expect(pickGenerateFace(options, { ...input, theme: "black", modelSlug: "menu-italic" })).toBeNull();
    expect(options[0].colours[0].faces.map((face) => face.face)).toEqual(expect.arrayContaining(["cashapp", "paypal", "zelle", "wifi"]));
  });

  it("shows the parts that come off the printer as always ready, not the bought ones", () => {
    const part = (slug: string, beds: PrintBed[]) =>
      model({ slug, kind: "part", productType: null, face: null, theme: null, currentVersion: version(null, beds) });
    const base = part("base-large", [{ label: "x4", copies: 4 }, { label: "x6 full plate", copies: 6 }]);
    const sticker = part("nfc-sticker-10x20", [{ label: "bought", copies: 1 }]);
    expect(isAlwaysReadyPart(base)).toBe(true);
    expect(printedPartBeds(base).map((b) => b.label)).toEqual(["x4", "x6 full plate"]);
    expect(isAlwaysReadyPart(sticker)).toBe(false);
    expect(isAlwaysReadyPart({ ...base, status: "retired" })).toBe(false);
    expect(isAlwaysReadyPart(model({}))).toBe(false);
  });

  it("groups always-ready parts into one family per piece, keeping their order", () => {
    const families = printPartFamilies([
      { title: "Stand base · Large" },
      { title: "Stand base · Small" },
      { title: "Google G token · Small Stand (13.5 mm)" },
      { title: "Solo part" },
    ]);
    expect(families.map((f) => [f.name, f.models.length])).toEqual([["Stand base", 2], ["Google G token", 1], ["Solo part", 1]]);
    expect(printPartVariant("Google G token · Small Stand (13.5 mm)")).toBe("Small Stand (13.5 mm)");
    expect(printPartVariant("Solo part")).toBe("Solo part");
  });
});

describe("a model's materials", () => {
  it("takes a sticker, a filament or something else, each with a name and optional spec, supplier, buy link and note", () => {
    const sticker = { kind: "nfc_sticker", name: " NFC sticker ", spec: "10 x 20 mm", supplier: " LeadSeals ", url: "https://example.com/sticker", note: "" };
    expect(printMaterialSchema.parse(sticker)).toEqual({ kind: "nfc_sticker", name: "NFC sticker", spec: "10 x 20 mm", supplier: "LeadSeals", url: "https://example.com/sticker", note: null });
    expect(printMaterialSchema.parse({ kind: "filament", name: "PLA" })).toEqual({ kind: "filament", name: "PLA" });
    expect(printMaterialSchema.parse({ kind: "other", name: "Glue", url: "  " }).url).toBeNull();
    expect(printMaterialsSchema.parse([sticker, { kind: "other", name: "Glue" }])).toHaveLength(2);
    expect(printMaterialsSchema.parse([])).toEqual([]);
  });

  it("refuses an unknown kind, an empty name, a link that is not http(s), and anything extra", () => {
    for (const bad of [
      { kind: "wood", name: "Oak" },
      { kind: "other" },
      { kind: "other", name: "   " },
      { kind: "other", name: "Glue", url: "javascript:alert(1)" },
      { kind: "other", name: "Glue", url: "ftp://example.com/glue" },
      { kind: "other", name: "Glue", url: "example.com/glue" },
      { kind: "other", name: "Glue", price: 3 },
      { kind: "other", name: "x".repeat(121) },
    ]) {
      expect(printMaterialSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(printMaterialsSchema.safeParse(Array.from({ length: 21 }, () => ({ kind: "other", name: "Glue" }))).success).toBe(false);
  });

  it("rides on the model's input and patch, as the whole list", () => {
    const materials = [{ kind: "nfc_sticker", name: "NFC sticker" }];
    expect(printModelInputSchema.parse({ slug: "base-large", kind: "part", title: "Base", materials }).materials).toEqual(materials);
    expect(printModelPatchSchema.parse({ materials }).materials).toEqual(materials);
    expect(printModelPatchSchema.parse({ materials: [] }).materials).toEqual([]);
    expect(printModelPatchSchema.safeParse({ materials: [{ kind: "wood", name: "Oak" }] }).success).toBe(false);
  });
});

describe("models released to an organization", () => {
  it("is every model when nothing was restricted, exactly the listed ones otherwise, none for an empty list", () => {
    expect(modelReleased(null, "plate-large-menu-white")).toBe(true);
    expect(modelReleased(undefined, "plate-large-menu-white")).toBe(true);
    expect(modelReleased(["plate-large-menu-white"], "plate-large-menu-white")).toBe(true);
    expect(modelReleased(["plate-large-menu-white"], "stand-large-google-white")).toBe(false);
    expect(modelReleased([], "plate-large-menu-white")).toBe(false);
  });
});

describe("menuFontsOf", () => {
  it("offers the six title fonts on a Menu piece and none on another", () => {
    expect(PRINT_MENU_FONTS).toHaveLength(6);
    expect(menuFontsOf("plate.menu")).toEqual(PRINT_MENU_FONTS);
    expect(menuFontsOf("stand.menu")).toEqual(PRINT_MENU_FONTS);
    expect(menuFontsOf("plate.google")).toEqual([]);
    expect(menuFontsOf(null)).toEqual([]);
  });
});
