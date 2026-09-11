import { stat, readFile } from 'node:fs/promises';
import { load as loadJsx } from './jsxLoaderHooks.mjs';
import { transform } from 'esbuild';

// Replace network/auth/query boundaries; render the real monthly workspace,
// dialogs, history and tenant tables, including their actual event handlers.
const utilitySource = await readFile(new URL('../shared/hooks/queries/useUtility.js', import.meta.url), 'utf8');
const hooks = [...utilitySource.matchAll(/export function (use\w+)/g)].map(match => match[1]);
const mocks = {
  utility: hooks.map(name => `export const ${name} = (...args) => globalThis.__monthlyUtilityTest.hook('${name}', ...args);`).join('\n') + '\nexport const utilityKeys = {all:()=>["utilities"]};',
  api: 'export const utilityApi = globalThis.__monthlyUtilityTest.api;',
  billingApi: 'export const billingApi = {};',
  billing: 'export const useBillsByBranch = () => ({data:[]}); export const useAdminPayments = () => ({data:[]});',
  settings: 'export const useBusinessSettings = () => ({data:{defaultWaterRatePerUnit:50}});',
  auth: 'export const useAuth = () => ({user:{role:"branch_admin",branch:"gil-puyat"}});',
  query: 'export const useQueryClient = () => ({invalidateQueries:async()=>{}}); export const useQuery=()=>({}); export const useMutation=()=>({}); export const keepPreviousData=data=>data;',
  notification: 'export const showNotification = (...args) => globalThis.__monthlyUtilityTest.notifications.push(args);',
  css: 'export default {};',
};
export async function resolve(specifier, context, nextResolve) {
  let mock;
  for (const [pattern,key] of [
    [/\/useUtility(?:\.js)?$/, 'utility'], [/\/utilityApi(?:\.js)?$/, 'api'],
    [/\/billingApi(?:\.js)?$/, 'billingApi'], [/\/useBilling(?:\.js)?$/, 'billing'],
    [/\/useSettings(?:\.js)?$/, 'settings'], [/\/useAuth(?:\.js)?$/, 'auth'],
    [/\/notification(?:\.js)?$/, 'notification'],
  ]) if (pattern.test(specifier)) mock = key;
  if (specifier === '@tanstack/react-query') mock = 'query';
  if (specifier.endsWith('.css')) mock = 'css';
  if (mock) return {url:`monthly-test:${mock}`,shortCircuit:true};
  try { return await nextResolve(specifier,context); }
  catch (error) {
    if (!specifier.startsWith('.')) throw error;
    for (const extension of ['.jsx','.js','/index.jsx','/index.js']) {
      const url = new URL(specifier+extension,context.parentURL);
      try { if ((await stat(url)).isFile()) return {url:url.href,shortCircuit:true}; } catch {}
    }
    throw error;
  }
}
export async function load(url,context,nextLoad) {
  if (url.startsWith('monthly-test:')) return {format:'module',source:mocks[url.slice(13)],shortCircuit:true};
  if (url.includes('/web/src/') && url.endsWith('.js')) {
    const source = await readFile(new URL(url),'utf8');
    const result = await transform(source,{loader:'jsx',format:'esm',jsx:'automatic'});
    return {format:'module',source:result.code,shortCircuit:true};
  }
  return loadJsx(url,context,nextLoad);
}
