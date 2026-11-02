import { describe, expect, it } from "vitest";
import { printModelPreviewPath, type PrintPreviewCatalog } from "@shared/printProduction";
import { resolvePieceModel } from "@/components/xpot/PieceThumb3D";

// Which 3D model a piece's picture shows (the piece template). A piece carries its product type and face, never its
// colour: the batch (or the model's own slug / theme) decides, and when nothing can, the flat drawing stays.

const model = (slug: string, productType: string, face: string, theme: string) => ({ slug, title: slug, productType, face, theme, sha256: `${slug}-hash` });

const catalog: PrintPreviewCatalog = {
  models: [
    model("stand-large-google-white", "large_stand", "google_review", "white"),
    model("stand-large-google-black", "large_stand", "google_review", "black"),
    model("plate-small-instagram-black", "small_plate", "instagram", "black"),
  ],
  batches: { "REV-2026-006": "stand-large-google-black", "REV-2026-003": "stand-large-google-white" },
};

describe("resolvePieceModel", () => {
  it('never substitutes private customer artwork for an unrecognized model or a generic product',()=>{
    const privateOnly={models:[{slug:'private-restaurant',title:'Private',productType:'large_plate',face:'menu',theme:null,sha256:'test',private:true}],batches:{'PRIVATE-1':'private-restaurant'}};
    expect(resolvePieceModel(privateOnly,{productType:'large_plate',face:'menu',modelSlug:'public-without-preview'})).toBeNull();
    expect(resolvePieceModel(privateOnly,{productType:'large_plate',face:'menu'})).toBeNull();
    expect(resolvePieceModel(privateOnly,{productType:'large_plate',face:'menu',modelSlug:'private-restaurant'})?.slug).toBe('private-restaurant');
    expect(resolvePieceModel(privateOnly,{productType:'large_plate',face:'menu',batchCode:'PRIVATE-1'})?.slug).toBe('private-restaurant');
  });
  it("tells white from black by the batch the piece came from", () => {
    expect(resolvePieceModel(catalog, { productType: "large_stand", face: "google_review", batchCode: "REV-2026-006" })?.slug).toBe("stand-large-google-black");
    expect(resolvePieceModel(catalog, { productType: "large_stand", face: "google_review", batchCode: "REV-2026-003" })?.slug).toBe("stand-large-google-white");
  });

  it("takes the model's own slug first", () => {
    expect(resolvePieceModel(catalog, { productType: "large_stand", face: "google_review", modelSlug: "stand-large-google-white", batchCode: "REV-2026-006" })?.slug)
      .toBe("stand-large-google-white");
  });

  it("uses the colour when the screen has it", () => {
    expect(resolvePieceModel(catalog, { productType: "large_stand", face: "google_review", theme: "Black" })?.slug).toBe("stand-large-google-black");
  });

  it("guesses nothing when white and black are both possible", () => {
    expect(resolvePieceModel(catalog, { productType: "large_stand", face: "google_review" })).toBeNull();
    expect(resolvePieceModel(catalog, { productType: "large_stand", face: "google_review", batchCode: "UNKNOWN-1" })).toBeNull();
  });

  it("picks the only model that can be it", () => {
    expect(resolvePieceModel(catalog, { productType: "small_plate", face: "instagram" })?.slug).toBe("plate-small-instagram-black");
  });

  it("leaves a piece with no preview alone", () => {
    expect(resolvePieceModel(catalog, { productType: "large_plate", face: "venmo", batchCode: "LPLATE-2026-006" })).toBeNull();
    expect(resolvePieceModel(catalog, { productType: "large_stand", face: null })).toBeNull();
  });
});

describe("printModelPreviewPath", () => {
  it("carries the hash so a replaced preview is a new url", () => {
    expect(printModelPreviewPath("stand-large-google-black", "721e3d60b4a74deb185641cf370bc89d5b0f592a702df61270bf5bb4df1acba9"))
      .toBe("/api/xpot/print-previews/stand-large-google-black/glb?v=721e3d60b4a7");
  });
});
