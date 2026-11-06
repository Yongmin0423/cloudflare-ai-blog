import {createInterface}from'node:readline/promises';
import{resolve}from'node:path';
import{StringDecoder}from'node:string_decoder';
process.env.WRANGLER_LOG_PATH??=resolve('.wrangler/logs');
process.env.WRANGLER_REGISTRY_PATH??=resolve('.wrangler/registry');
const{getPlatformProxy}=await import('wrangler');
const{readAuthSettings}=await import('../packages/auth/src/config.ts');
const{provisionAdministrator}=await import('../packages/auth/src/provision.ts');
if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('터미널에서 pnpm admin:create를 직접 실행해 주세요. 비밀번호를 인수나 파일로 받지 않습니다.');
const rl=createInterface({input:process.stdin,output:process.stdout});
const username=await rl.question('관리자 아이디 (3~32자 영문 소문자/숫자/._-): ');rl.close();
async function passwordPrompt(label){
 process.stdout.write(label);process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((resolve,reject)=>{
  let value='';const decoder=new StringDecoder('utf8');function done(){process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');}
  function onData(chunk){for(const character of decoder.write(chunk)){
   if(character==='\u0003'){done();reject(Error('등록을 취소했습니다.'));return;}
   if(character==='\r'||character==='\n'){done();resolve(value);return;}
   if(character==='\u007f'||character==='\b'){value=value.slice(0,-1);continue;}
   if(character>=' ')value+=character;
  }}process.stdin.on('data',onData);
 });
}
let password=await passwordPrompt('비밀번호 (12~128자, 화면에 표시하지 않음): ');
let confirm=await passwordPrompt('비밀번호 확인: ');
if(password!==confirm)throw Error('비밀번호가 일치하지 않습니다.');
const platform=await getPlatformProxy({configPath:resolve('apps/admin-web/wrangler.jsonc'),persist:{path:resolve('.wrangler/state/v3')}});
try{
 const settings=readAuthSettings(platform.env);
 if(!await platform.env.DB.prepare('SELECT 1 FROM blogs WHERE id=?').bind(settings.blogId).first())throw Error('로컬 블로그 초기 데이터를 먼저 준비해 주세요.');
 const created=await provisionAdministrator(platform.env.DB,settings.blogId,{username,password});
 console.log('최초 관리자 '+created.username+' 생성 완료. '+settings.origin+'/login에서 로그인하세요.');
}finally{password='';confirm='';await platform.dispose();}
