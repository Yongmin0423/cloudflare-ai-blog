// Compile workspace TypeScript for repository tests and resolve Next source aliases.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import ts from 'typescript';
registerHooks({ resolve(specifier,context,next) {
  if(specifier === "@cloudflare-ai-blog/shared") return {url:new URL("../../shared/src/management.ts",import.meta.url).href,shortCircuit:true};
  if(specifier.startsWith('.') && context.parentURL?.includes('/packages/') && !specifier.endsWith('.ts')) {
    const candidate=new URL(specifier+'.ts',context.parentURL);
    if(existsSync(candidate))return {url:candidate.href,shortCircuit:true};
  }
  return next(specifier,context);
}, load(url, context, next) {
  if (url.startsWith('file:') && url.endsWith('.ts') && (url.includes('/packages/') || url.includes('/@cloudflare-ai-blog/'))) {
    return { format:'module', shortCircuit:true, source:ts.transpileModule(readFileSync(new URL(url),'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText };
  }
  return next(url,context);
} });
