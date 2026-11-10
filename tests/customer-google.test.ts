import {test,expect,vi} from 'vitest';
import express from 'express';
import session from 'express-session';
import type {AddressInfo} from 'node:net';
process.env.DATABASE_URL||='postgresql://test@127.0.0.1:1/test';
const h=vi.hoisted(()=>({identity:{uid:'phone-test',phone:'+15550160001',provider:'phone'},record:vi.fn()}));
vi.mock('../server/auth/googleIdentity.js',async original=>({...await original<typeof import('../server/auth/googleIdentity.js')>(),verifyGoogleIdentity:async()=>h.identity}));
vi.mock('../server/customer/repository.js',()=>({
 pieceForSignIn:async(code:string)=>code==='CG00A001'?{leadId:1,status:'active'}:null,
 leadAccessData:async()=>({exists:true,contactPhones:['+15550160001'],businessPhone:'+15550160002'}),
 recordSignIn:h.record,leadIdsOfPhone:async()=>[1],
}));
test('Google phone confirmation requires the panel challenge and never creates a team session',async()=>{
 for(const[k,v]of Object.entries({GOOGLE_AUTH_ENABLED:'true',GOOGLE_AUTH_PROJECT_ID:'skaleclub',FIREBASE_API_KEY:'test',FIREBASE_AUTH_DOMAIN:'test.firebaseapp.com',GOOGLE_WEB_CLIENT_ID:'test.apps.googleusercontent.com',CUSTOMER_PANEL_ENABLED:'true'}))vi.stubEnv(k,v);
 const{registerCustomerRoutes}=await import('../server/customer/routes.js');
 const app=express();app.use(express.json());app.use(session({secret:'test-only',resave:false,saveUninitialized:false}));
 const sms={live:true,send:vi.fn()};registerCustomerRoutes(app,sms);
 app.get('/session',(req,res)=>res.json({userId:(req.session as any).userId??null,phone:(req.session as any).customerPhone??null}));
 const server=app.listen(0);const base=`http://127.0.0.1:${(server.address()as AddressInfo).port}`;
 let cookie='';const call=async(path:string,body?:unknown,origin=base)=>{let r=await fetch(base+path,{method:body?'POST':'GET',headers:{origin,cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const next=r.headers.get('set-cookie');if(next)cookie=next.split(';')[0];return{status:r.status,body:await r.json()};};
 try{
  expect((await call('/api/my/verify',{idToken:'valid'})).status).toBe(401);
  const request={code:'CG00A001',phone:'+15550160001',lang:'en'};
  const challenge=await call('/api/my/code',request);expect(challenge.body.provider).toBe('google');expect(sms.send).not.toHaveBeenCalled();
  h.identity.phone='+15550160009';expect((await call('/api/my/verify',{idToken:'valid'})).status).toBe(401);
  h.identity.phone='+15550160001';expect((await call('/api/my/verify',{idToken:'valid'},'https://evil.test')).status).toBe(403);
  expect((await call('/api/my/verify',{idToken:'valid'})).status).toBe(200);
  expect((await call('/session')).body).toEqual({userId:null,phone:'+15550160001'});
  expect(h.record).toHaveBeenCalledWith('+15550160001',null);
  cookie='';const unknown=await call('/api/my/code',{...request,code:'UNKNOWN'});expect(unknown.body).toEqual(challenge.body);
  expect((await call('/api/my/verify',{idToken:'valid'})).status).toBe(403);
  expect((await call('/session')).body.userId).toBeNull();
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));vi.unstubAllEnvs();}
},20000);
