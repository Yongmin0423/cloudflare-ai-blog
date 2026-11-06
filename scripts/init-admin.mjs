import {randomBytes}from'node:crypto';
import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{resolve}from'node:path';
const app=resolve('apps/admin-web');
const paths=['.env.local','.dev.vars'].map(name=>resolve(app,name));
const files=paths.map(path=>existsSync(path)?readFileSync(path,'utf8'):'');
const read=(text,key)=>text.match(new RegExp('^'+key+'=(.*)$','m'))?.[1].trim().replace(/^(["'])(.*)\1$/,'$2');
const existing=files.map(text=>read(text,'AUTH_SECRET')).filter(Boolean);
if(new Set(existing).size>1)throw Error('두 로컬 설정 파일의 AUTH_SECRET이 달라요. 값을 출력하지 말고 동일하게 맞춰 주세요.');
const secret=existing[0]??randomBytes(32).toString('base64url');
if(secret.length<32)throw Error('기존 AUTH_SECRET이 너무 짧아요. 최소 32자여야 합니다.');
const origin=files.map(text=>read(text,'ADMIN_ORIGIN')).find(Boolean)??'http://localhost:3001';
const blogId=files.map(text=>read(text,'ADMIN_BLOG_ID')).find(Boolean)??'10000000-0000-4000-8000-000000000001';
for(let i=0;i<paths.length;i++){
 let text=files[i];for(const[key,value]of Object.entries({AUTH_SECRET:secret,ADMIN_ORIGIN:origin,ADMIN_BLOG_ID:blogId})){
  const current=read(text,key);if(current&&current!==value)throw Error(key+' 설정이 두 파일에서 달라요.');
  if(!current){text=text.replace(new RegExp('^'+key+'=.*(?:\\r?\\n|$)','m'),'');text+=(text.endsWith('\n')||!text?'':'\n')+key+'='+value+'\n';}
 }writeFileSync(paths[i],text);
}
console.log('로컬 인증 설정을 준비했습니다. 기존 비밀키는 유지하며 값은 출력하지 않습니다.');
console.log('pnpm db:migrate:local → pnpm db:bootstrap:local → pnpm admin:create 순서로 최초 관리자를 등록하세요.');
