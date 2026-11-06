import test from'node:test';import assert from'node:assert/strict';
import{readFileSync,readdirSync}from'node:fs';import{DatabaseSync}from'node:sqlite';import{betterAuth}from'better-auth';
const{authOptions,readAuthSettings,safeReturnPath,sameOriginWrite}=await import('../src/config.ts');
const{databaseRateLimiter}=await import('../src/rate-limit.ts');
const{provisionAdministrator,administratorExists}=await import('../src/provision.ts');
const{handleAuthRequest}=await import('../src/handler.ts');
const settings={origin:'http://localhost:3001',secret:'test-only-auth-secret-with-over-32-characters',blogId:'a'};
async function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../../database/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../../database/migrations/'+file,import.meta.url),'utf8'));
 sqlite.exec("INSERT INTO blogs(id,name) VALUES('a','A'),('b','B');");
 const db={exec(sql){sqlite.exec(sql);return Promise.resolve({});},prepare(sql){const statement=sqlite.prepare(sql);let values=[];return{bind(...args){values=args;return this;},async first(){return statement.get(...values)??null;},async all(){const results=statement.all(...values);const changes=sqlite.prepare('SELECT changes() AS n').get().n;return{results,meta:{changes,last_row_id:0}};},async run(){return{meta:{changes:Number(statement.run(...values).changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.all());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const auth=betterAuth(authOptions(db,settings,databaseRateLimiter(db)));
 const initialized=await auth.$context;await initialized.explicitSchemaCheck?.();
 const context={db,auth,settings};
 return{sqlite,db,auth,context};
}
const credential={username:'owner',password:'test-only-password-456789!'};
const request=(path,body={},origin=settings.origin,method='POST',cookie='')=>new Request(settings.origin+'/api/auth/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},...(method==='POST'?{body:JSON.stringify(body)}:{})});
function cookie(response){return response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');}
test('settings fail closed and return path/origin validation rejects external destinations',()=>{
 assert.throws(()=>readAuthSettings({}));assert.throws(()=>readAuthSettings({AUTH_SECRET:settings.secret,ADMIN_ORIGIN:'http://example.com',ADMIN_BLOG_ID:'a'}));
 assert.deepEqual(readAuthSettings({AUTH_SECRET:settings.secret,ADMIN_ORIGIN:settings.origin,ADMIN_BLOG_ID:'a'}),settings);
 for(const value of ['https://evil.example','//evil.example','/\\evil.example','/api/auth/sign-out','/login','/\r\nx'])assert.equal(safeReturnPath(value),'/');
 assert.equal(safeReturnPath('/posts/new?x=1'),'/posts/new?x=1');assert.equal(sameOriginWrite(request('sign-out',{},'https://evil.example'),settings.origin),false);
});
test('provisioning hashes passwords, grants only one blog and refuses repeated/invalid creation',async()=>{
 const{db,sqlite}=await database();try{
  const user=await provisionAdministrator(db,'a',credential);const hash=sqlite.prepare('SELECT password FROM auth_accounts').get().password;
  assert.notEqual(hash,credential.password);assert.ok(hash.length>100);assert.equal(await administratorExists(db,user.id,'a'),true);assert.equal(await administratorExists(db,user.id,'b'),false);
  await assert.rejects(()=>provisionAdministrator(db,'a',credential),/이미 관리자/);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM auth_users').get().n,1);
  await assert.rejects(()=>provisionAdministrator(db,'a',{...credential,username:'!!'}));
 }finally{sqlite.close();}
});
test('username login sets HttpOnly cookie, hides token, validates real D1 session and logout revokes it',async()=>{
 const{db,auth,sqlite,context}=await database();try{
  await provisionAdministrator(db,'a',credential);
  assert.equal((await handleAuthRequest(request('sign-in/username',{...credential,password:'wrong'}),context)).status,401);
  const response=await handleAuthRequest(request('sign-in/username',credential),context);assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  assert.match(response.headers.get('set-cookie'),/httponly/i);assert.match(response.headers.get('set-cookie'),/samesite=lax/i);
  const session=await auth.api.getSession({headers:new Headers({cookie:cookie(response)})});assert.equal(session.user.username,'owner');
  assert.ok(new Date(session.session.expiresAt).getTime()-Date.now()<=8*3600000+1000);
  assert.equal(await auth.api.getSession({headers:new Headers({cookie:cookie(response)+'tampered'})}),null);
  assert.equal((await handleAuthRequest(request('sign-out',{},settings.origin,'POST',cookie(response)),context)).status,200);
  assert.equal(await auth.api.getSession({headers:new Headers({cookie:cookie(response)})}),null);
 }finally{sqlite.close();}
});
test('signup/other auth routes, cross-origin and oversized login requests are blocked',async()=>{
 const{context,sqlite}=await database();try{
  for(const path of ['sign-up/email','sign-in/email','update-user','change-password'])assert.equal((await handleAuthRequest(request(path,credential),context)).status,404);
  assert.equal((await handleAuthRequest(request('sign-in/username',credential,'https://evil.example'),context)).status,403);
  assert.equal((await handleAuthRequest(request('sign-in/username',{...credential,password:'x'.repeat(5000)}),context)).status,413);
  assert.equal((await handleAuthRequest(request('sign-out',{},settings.origin,'GET'),context)).status,404);
 }finally{sqlite.close();}
});
test('an account without blog administrator permission cannot retain a usable login session',async()=>{
 const{db,context,sqlite}=await database();try{
  const user=await provisionAdministrator(db,'a',credential);sqlite.prepare('DELETE FROM auth_administrators WHERE user_id=?').run(user.id);
  const response=await handleAuthRequest(request('sign-in/username',credential),context);assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM auth_sessions').get().n,0);
 }finally{sqlite.close();}
});
test('D1 rate limiter atomically counts concurrent attempts and login enforces the global threshold',async()=>{
 const{db,context,sqlite}=await database();try{
  const limiter=databaseRateLimiter(db);const decisions=await Promise.all(Array.from({length:12},()=>limiter.consume('same-key',{window:60,max:5})));
  assert.equal(decisions.filter(d=>d.allowed).length,5);assert.ok(decisions.at(-1).retryAfter>0);
  await provisionAdministrator(db,'a',credential);
  for(let i=0;i<5;i++)assert.equal((await handleAuthRequest(request('sign-in/username',{...credential,password:'wrong'}),context)).status,401);
  const blocked=await handleAuthRequest(request('sign-in/username',credential),context);assert.equal(blocked.status,429);assert.ok(blocked.headers.get('Retry-After'));
 }finally{sqlite.close();}
});
