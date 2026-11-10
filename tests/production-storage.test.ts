import { afterEach, describe, expect, it, vi } from "vitest";
import { assertProductionFileStores, activeStore, publicStore, storeFor } from "../server/lib/files.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

const config={NODE_ENV:"production",R2_ACCOUNT_ID:"example",R2_ACCESS_KEY_ID:"key",R2_SECRET_ACCESS_KEY:"secret",R2_BUCKET:"private",R2_PUBLIC_BUCKET:"public",R2_PUBLIC_BASE_URL:"https://media.example.test"};
afterEach(()=>vi.unstubAllEnvs());

describe("production is independent of Supabase services",()=>{
  it("accepts complete R2 configuration with no Supabase keys",()=>{
    expect(()=>assertProductionFileStores(config)).not.toThrow();
  });
  it.each(["R2_BUCKET","R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_PUBLIC_BUCKET","R2_PUBLIC_BASE_URL"])("fails before boot without %s",name=>{
    expect(()=>assertProductionFileStores({...config,[name]:undefined})).toThrow();
  });
  it("never exposes the private bucket as public",()=>{
    expect(()=>assertProductionFileStores({...config,R2_PUBLIC_BUCKET:"private"})).toThrow("separate");
  });
  it("does not require storage keys for database-only development",()=>{
    expect(()=>assertProductionFileStores({NODE_ENV:"development"})).not.toThrow();
  });
  it("ignores leftover production Supabase credentials and refuses managed fallbacks",()=>{
    vi.stubEnv("NODE_ENV","production");
    vi.stubEnv("SUPABASE_URL","https://legacy.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","not-a-real-key");
    for(const name of ["R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET"])vi.stubEnv(name,"");
    expect(storeFor("supabase")).toBeNull();
    expect(publicStore()).toBeNull();
    expect(activeStore()).toBeNull();
    expect(()=>getSupabaseAdmin()).toThrow("disabled in production");
  });
});
