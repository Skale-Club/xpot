import { test, expect, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import type { AddressInfo } from 'node:net';

const verify = vi.hoisted(() => vi.fn());
vi.mock('../server/auth/googleIdentity.js', async (original) => ({ ...await original<typeof import('../server/auth/googleIdentity.js')>(),verifyGoogleIdentity:verify }));

test.skipIf(process.env.TAGS_INTEGRATION !== '1')('phone and Google sign in on their own; linking happens inside the app', async () => {
 vi.stubEnv('GOOGLE_AUTH_ENABLED','true'); vi.stubEnv('GOOGLE_AUTH_PROJECT_ID','skaleclub'); vi.stubEnv('FIREBASE_API_KEY','test'); vi.stubEnv('FIREBASE_AUTH_DOMAIN','test.firebaseapp.com');vi.stubEnv('GOOGLE_WEB_CLIENT_ID','test.apps.googleusercontent.com');
 const { db,pool }=await import('../server/db.js'); const { sql }=await import('drizzle-orm');
 const {registerGoogleLoginRoutes}=await import('../server/auth/googleLogin.js');
 const {registerPhoneAuthRoutes}=await import('../server/auth/phoneAuth.js');
 const {registerAccountLinkRoutes}=await import('../server/auth/accountLinks.js');
 const clean=async()=>{
  await db.execute(sql`DELETE FROM auth_access_requests WHERE user_id IN (SELECT id FROM users WHERE id LIKE 'google-auth-test-%' OR email LIKE '%@google-auth.test' OR phone LIKE '+1555015%')`);
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id IN (SELECT id FROM users WHERE id LIKE 'google-auth-test-%' OR email LIKE '%@google-auth.test' OR phone LIKE '+1555015%')`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'google-auth-test-%' OR email LIKE '%@google-auth.test' OR phone LIKE '+1555015%'`);
 };
 await clean();
 await db.execute(sql`INSERT INTO users(id,phone,email,first_name) VALUES('google-auth-test-active','+15550150001','owner@google-auth.test','Active'),('google-auth-test-pending','+15550150002',null,'Pending'),('google-auth-test-blocked','+15550150003',null,'Blocked')`);
 await db.execute(sql`INSERT INTO sales_reps(user_id,display_name,is_active,blocked_at) VALUES('google-auth-test-active','Active',true,null),('google-auth-test-pending','Pending',false,null),('google-auth-test-blocked','Blocked',false,now())`);
 await db.execute(sql`INSERT INTO auth_access_requests(user_id,status) VALUES('google-auth-test-pending','pending')`);
 const app=express(); app.use(express.json());app.use(session({secret:'test-only-session-secret',resave:false,saveUninitialized:false}));
 registerPhoneAuthRoutes(app, { live: false, send: async () => {} } as any);
 registerGoogleLoginRoutes(app);
 registerAccountLinkRoutes(app);
 app.get('/session',(req,res)=>{const s=req.session as any;res.json({userId:s.userId??null,applicant:s.applicant?{phone:s.applicant.phone??null,email:s.applicant.email??null}:null});});
 const server=app.listen(0);const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const browser=()=>{let cookie='';return async (method:string,path:string,body?:unknown,origin=base)=>{
  const r=await fetch(base+path,{method,headers:{origin,'Content-Type':'application/json',cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const next=r.headers.get('set-cookie');if(next)cookie=next.split(';')[0];return {status:r.status,body:await r.json().catch(()=>({}))};};};
 const signIn=(call:ReturnType<typeof browser>)=>call('POST','/api/auth/identity',{idToken:'verified-by-test-boundary'});
 try {
  // Phone on its own, for every kind of person.
  for(const [phone,status] of [['+15550150001','active'],['+15550150002','pending'],['+15550150003','blocked']] as const){
   const call=browser();verify.mockResolvedValue({uid:'phone-'+status,phone,provider:'phone'});
   expect((await signIn(call)).body.status).toBe(status);
   expect((await call('GET','/session')).body.userId).toBe(status==='active'?'google-auth-test-active':null);
  }

  // Google on its own: never matched by email, never asked for a phone.
  const stranger=browser();verify.mockResolvedValue({uid:'google-owner',email:'owner@google-auth.test',name:'Owner Google',provider:'google.com'});
  expect((await signIn(stranger)).body.status).toBe('new');
  expect((await stranger('GET','/session')).body).toEqual({userId:null,applicant:{phone:null,email:'owner@google-auth.test'}});
  const draft=await stranger('GET','/api/auth/phone/application-draft');
  expect(draft.body).toMatchObject({draft:null,suggested:{displayName:'Owner Google',email:'owner@google-auth.test'}});

  // A brand-new Google person applies without any phone.
  const newcomer=browser();verify.mockResolvedValue({uid:'google-newcomer',email:'newcomer@google-auth.test',name:'New Comer',provider:'google.com'});
  expect((await signIn(newcomer)).body.status).toBe('new');
  expect((await newcomer('PUT','/api/auth/phone/application-draft',{displayName:'New Comer',step:1})).status).toBe(200);
  const application={displayName:'New Comer',email:'newcomer@google-auth.test',workCity:'Boston',workRegion:'MA',hasVehicle:true,kitInvestmentAcknowledged:true,activeSellerAcknowledged:true};
  expect((await newcomer('POST','/api/auth/phone/register',application)).status).toBe(201);
  const created=(await db.execute(sql`SELECT u.phone,u.email FROM users u JOIN auth_google_identities g ON g.user_id=u.id WHERE g.subject='google-newcomer'`)).rows;
  expect(created).toEqual([{phone:null,email:'newcomer@google-auth.test'}]);
  // Signing in with that Google later finds the application waiting.
  verify.mockResolvedValue({uid:'google-newcomer',email:'newcomer@google-auth.test',provider:'google.com'});
  expect((await signIn(browser())).body.status).toBe('pending');

  // Inside the app: the active person links their Google account.
  const owner=browser();verify.mockResolvedValue({uid:'phone-active',phone:'+15550150001',provider:'phone'});
  expect((await signIn(owner)).body.status).toBe('active');
  expect((await owner('GET','/api/auth/sign-in-methods')).body).toEqual({phone:'+15550150001',google:[],canLink:true});
  verify.mockResolvedValue({uid:'google-owner',email:'owner@google-auth.test',provider:'google.com'});
  expect((await owner('POST','/api/auth/sign-in-methods',{idToken:'t'})).body.google).toEqual([{email:'owner@google-auth.test'}]);
  // Now that Google alone opens the account.
  expect((await signIn(browser())).body.status).toBe('active');
  // A Google account already on someone else's account is refused.
  verify.mockResolvedValue({uid:'google-newcomer',email:'newcomer@google-auth.test',provider:'google.com'});
  expect((await owner('POST','/api/auth/sign-in-methods',{idToken:'t'})).body.code).toBe('linked_elsewhere');
  // So is a phone that signs in to another account.
  verify.mockResolvedValue({uid:'phone-pending',phone:'+15550150002',provider:'phone'});
  expect((await owner('POST','/api/auth/sign-in-methods',{idToken:'t'})).body.code).toBe('phone_in_use');
  expect((await owner('POST','/api/auth/sign-in-methods',{idToken:'t'},'https://other.test')).status).toBe(403);
  // Google can be removed while a phone still opens the account.
  expect((await owner('DELETE','/api/auth/sign-in-methods/google')).body.google).toEqual([]);
  verify.mockResolvedValue({uid:'google-owner',email:'owner@google-auth.test',provider:'google.com'});
  expect((await signIn(browser())).body.status).toBe('new');

  // A Google-only account links a phone, which then signs in on its own.
  await db.execute(sql`UPDATE sales_reps SET is_active=true WHERE user_id=(SELECT user_id FROM auth_google_identities WHERE subject='google-newcomer')`);
  const googleOnly=browser();verify.mockResolvedValue({uid:'google-newcomer',email:'newcomer@google-auth.test',provider:'google.com'});
  expect((await signIn(googleOnly)).body.status).toBe('active');
  expect((await googleOnly('DELETE','/api/auth/sign-in-methods/google')).body.code).toBe('last_method');
  verify.mockResolvedValue({uid:'phone-newcomer',phone:'+15550150009',provider:'phone'});
  expect((await googleOnly('POST','/api/auth/sign-in-methods',{idToken:'t'})).body.phone).toBe('+15550150009');
  expect((await signIn(browser())).body.status).toBe('active');

  verify.mockRejectedValue(new Error('Invalid signature'));
  expect((await signIn(browser())).status).toBe(401);
  expect((await browser()('POST','/api/auth/identity',{idToken:'x'},'https://other.test')).status).toBe(403);
 } finally {server.close();await clean();await pool.end();vi.unstubAllEnvs();}
},30000);
