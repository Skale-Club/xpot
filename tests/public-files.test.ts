import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discardFiles, isRepAvatarUrl, publicR2Key, publicUploadsConfigured, putPublicFile, setFileStoresForTests } from "../server/lib/files.js";
import { memoryStore } from "./helpers/memoryStore.js";

beforeEach(() => {
  for (const [name, value] of Object.entries({R2_ACCOUNT_ID:"example",R2_ACCESS_KEY_ID:"test",R2_SECRET_ACCESS_KEY:"test",R2_BUCKET:"private-files",R2_PUBLIC_BUCKET:"public-assets",R2_PUBLIC_BASE_URL:"https://media.example.test/xpot",R2_ENDPOINT:""})) vi.stubEnv(name,value);
});
afterEach(() => { setFileStoresForTests(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("independent public assets", () => {
  it("uploads to the public store and returns a permanent URL without touching private or Supabase stores", async () => {
    const store=memoryStore("r2");
    const put=vi.spyOn(store,"put");
    setFileStoresForTests({publicR2:store, r2:null, supabase:null, public:null});
    expect(publicUploadsConfigured()).toBe(true);
    expect(await putPublicFile("avatars/7/profile.webp",new Uint8Array([1]),"image/webp")).toBe("https://media.example.test/xpot/avatars/7/profile.webp");
    expect(put).toHaveBeenCalledWith("avatars/7/profile.webp",new Uint8Array([1]),"image/webp");
  });
  it("recognizes only this app's public URLs and the matching avatar owner", () => {
    const url="https://media.example.test/xpot/avatars/7/profile.png";
    expect(publicR2Key(url)).toBe("avatars/7/profile.png");
    expect(isRepAvatarUrl(url,7)).toBe(true);
    expect(isRepAvatarUrl(url,8)).toBe(false);
    for(const ref of ["https://other.example.test/xpot/avatars/7/profile.png","https://media.example.test/xpot-other/avatars/7/profile.png","https://media.example.test/xpot/photos/7/private.jpg",url+"?other=1","https://media.example.test/xpot/avatars/7/a%2Fb.png"]) expect(publicR2Key(ref)).toBeNull();
  });
  it("deletes replaced public avatars from the public bucket only", async () => {
    const store=memoryStore("r2");
    const remove=vi.spyOn(store,"remove");
    setFileStoresForTests({publicR2:store,r2:null,supabase:null,public:null});
    expect(await discardFiles(["https://media.example.test/xpot/avatars/7/profile.png"],"avatar")).toEqual({deleted:1,failed:0});
    expect(remove).toHaveBeenCalledWith(["avatars/7/profile.png"]);
  });
  it("does not fall back to Supabase after an R2 upload failure", async () => {
    const store=memoryStore("r2");
    vi.spyOn(store,"put").mockRejectedValue(new Error("R2 unavailable"));
    const legacy=memoryStore("supabase");
    const legacyPut=vi.spyOn(legacy,"put");
    setFileStoresForTests({publicR2:store,public:legacy});
    await expect(putPublicFile("branding/logo.png",new Uint8Array([1]),"image/png")).rejects.toThrow("R2 unavailable");
    expect(legacyPut).not.toHaveBeenCalled();
  });
  it.each(["photos/7/private.jpg","audio/7/private.webm","print/00000000-0000-0000-0000-000000000000/file.png","avatars/7/../file.png","branding/a/b.png"])("never publishes a private or invalid key: %s",async key => {
    await expect(putPublicFile(key,new Uint8Array(),"image/png")).rejects.toThrow("Invalid public asset key");
  });
  it("rejects using the private bucket as the public bucket", () => {
    vi.stubEnv("R2_PUBLIC_BUCKET","private-files");
    expect(()=>publicUploadsConfigured()).toThrow("separate");
  });
  it("fails on incomplete public configuration instead of silently writing Supabase", () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL","");
    expect(()=>publicUploadsConfigured()).toThrow("separate");
  });
  it.each(["http://media.example.test","https://user:password@media.example.test","https://media.example.test/?key=value","https://media.example.test/#fragment"])("rejects unsafe public URL configuration",base=>{
    vi.stubEnv("R2_PUBLIC_BASE_URL",base);
    expect(()=>publicUploadsConfigured()).toThrow("HTTPS URL");
  });
  it("keeps legacy URLs valid during the staged rollout", () => {
    vi.stubEnv("R2_PUBLIC_BUCKET","");vi.stubEnv("R2_PUBLIC_BASE_URL","");
    vi.stubEnv("SUPABASE_URL","https://legacy.supabase.co");
    expect(isRepAvatarUrl("https://legacy.supabase.co/storage/v1/object/public/uploads/avatars/7/old.png",7)).toBe(true);
    expect(publicR2Key("https://media.example.test/xpot/avatars/7/profile.png")).toBeNull();
  });
});
