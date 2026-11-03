import { describe, expect, it, vi } from "vitest";
vi.mock("../server/routes.js",()=>({registerRoutes:vi.fn()}));
vi.mock("../server/errorHandler.js",()=>({apiErrorHandler:vi.fn()}));
const {assertRequiredEnv}=await import("../server/app.js");

const production={NODE_ENV:"production",DATABASE_URL:"postgres://private/xpot",SESSION_SECRET:"test-session",GOOGLE_AUTH_ENABLED:"true",GOOGLE_AUTH_PROJECT_ID:"skaleclub",FIREBASE_API_KEY:"public-test-key",FIREBASE_AUTH_DOMAIN:"skaleclub.firebaseapp.com",GOOGLE_WEB_CLIENT_ID:"test-client",R2_ACCOUNT_ID:"test-account",R2_ACCESS_KEY_ID:"test-key",R2_SECRET_ACCESS_KEY:"test-secret",R2_BUCKET:"private",R2_PUBLIC_BUCKET:"public",R2_PUBLIC_BASE_URL:"https://media.example.test"};

describe("production startup dependency contract",()=>{
  it("starts with Google, PostgreSQL and R2 without any Supabase variables",()=>{
    expect(()=>assertRequiredEnv(production)).not.toThrow();
  });
  it("requires the enabled Google identity flow",()=>{
    expect(()=>assertRequiredEnv({...production,GOOGLE_AUTH_ENABLED:"false"})).toThrow("authentication");
    expect(()=>assertRequiredEnv({...production,GOOGLE_WEB_CLIENT_ID:undefined})).toThrow("GOOGLE_WEB_CLIENT_ID");
  });
  it("rejects an incomplete production storage cutover",()=>{
    expect(()=>assertRequiredEnv({...production,R2_PUBLIC_BUCKET:undefined,R2_PUBLIC_BASE_URL:undefined})).toThrow("Production requires");
  });
  it("allows Supabase database development without forcing production storage",()=>{
    expect(()=>assertRequiredEnv({NODE_ENV:"development",SESSION_SECRET:"test-session",DEV_DATABASE_URL:"postgres://dev.supabase.example/dev"})).not.toThrow();
  });
});
