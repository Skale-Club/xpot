import { test, expect, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import type { AddressInfo } from 'node:net';

const verify = vi.hoisted(() => vi.fn());
vi.mock('../server/auth/googleIdentity.js', async (original) => ({ ...await original<typeof import('../server/auth/googleIdentity.js')>(),verifyGoogleIdentity:verify }));

test.skipIf(process.env.TAGS_INTEGRATION !== '1')('Google and phone retain app approval, phone ownership and session boundaries', async () => {
 vi.stubEnv('GOOGLE_AUTH_ENABLED','true'); vi.stubEnv('GOOGLE_AUTH_PROJECT_ID','skaleclub'); vi.stubEnv('FIREBASE_API_KEY','test'); vi.stubEnv('FIREBASE_AUTH_DOMAIN','test.firebaseapp.com');vi.stubEnv('GOOGLE_WEB_CLIENT_ID','test.apps.googleusercontent.com');
 const { db,pool }=await import('../server/db.js'); const { sql }=await import('drizzle-orm');
 const {registerGoogleLoginRoutes}=await import('../server/auth/googleLogin.js');
 const clean=async()=>{
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'google-auth-test-%'`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'google-auth-test-%'`);
 };
 await clean();
 await db.execute(sql`INSERT INTO users(id,phone,email,first_name) VALUES('google-auth-test-active','+15550150001','owner@google-auth.test','Active'),('google-auth-test-pending','+15550150002',null,'Pending'),('google-auth-test-blocked','+15550150003',null,'Blocked')`);
 await db.execute(sql`INSERT INTO sales_reps(user_id,display_name,is_active,blocked_at) VALUES('google-auth-test-active','Active',true,null),('google-auth-test-pending','Pending',false,null),('google-auth-test-blocked','Blocked',false,now())`);
 await db.execute(sql`INSERT INTO auth_access_requests(user_id,status) VALUES('google-auth-test-pending','pending')`);
 const app=express(); app.use(express.json());app.use(session({secret:'test-only-session-secret',resave:false,saveUninitialized:false}));
 registerGoogleLoginRoutes(app);
 app.get('/session',(req,res)=>res.json({userId:(req.session as any).userId??null,verifiedPhone:(req.session as any).verifiedPhone?.phone??null}));
 const server=app.listen(0);const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const browser=()=>{let cookie='';return async (path:string,origin=base)=>{let r=await fetch(base+path,{method:path==='/session'?'GET':'POST',headers:{origin,'Content-Type':'application/json',cookie},...(path==='/session'?{}:{body:JSON.stringify({idToken:'verified-by-test-boundary'})})});let next=r.headers.get('set-cookie');if(next)cookie=next.split(';')[0];return {status:r.status,body:await r.json()};};};
 try {
  for(const [phone,status] of [['+15550150001','active'],['+15550150002','pending'],['+15550150003','blocked']] as const){
   const call=browser();verify.mockResolvedValue({uid:'phone-'+status,phone,provider:'phone'});
   expect((await call('/api/auth/identity')).body.status).toBe(status);
   expect((await call('/session')).body.userId).toBe(status==='active'?'google-auth-test-active':null);
  }
  const call=browser();verify.mockResolvedValue({uid:'google-alternative',email:'owner@google-auth.test',provider:'google.com'});
  expect((await call('/api/auth/identity')).body.status).toBe('phone_required');
  expect((await call('/session')).body.userId).toBeNull();
  verify.mockResolvedValue({uid:'phone-active',phone:'+15550150001',provider:'phone'});
  expect((await call('/api/auth/identity')).body.status).toBe('active');
  const fresh=browser();verify.mockResolvedValue({uid:'google-alternative',provider:'google.com'});
  expect((await fresh('/api/auth/identity')).body.status).toBe('active');
  const stranger=browser(); verify.mockResolvedValue({uid:'phone-new',phone:'+15550150009',provider:'phone'});
  expect((await stranger('/api/auth/identity')).body.status).toBe('new');
  expect((await stranger('/session')).body).toEqual({userId:null,verifiedPhone:'+15550150009'});
  verify.mockRejectedValue(new Error('Invalid signature'));
  expect((await browser()('/api/auth/identity')).status).toBe(401);
  expect((await browser()('/api/auth/identity','https://other.test')).status).toBe(403);
 } finally {server.close();await clean();await pool.end();vi.unstubAllEnvs();}
},30000);
