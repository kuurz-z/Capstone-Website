import { stat } from 'node:fs/promises';
import { load as loadJsx } from './jsxLoaderHooks.mjs';

// Mock network/query boundaries only; the real lifecycle components, form
// handlers, utilities and DOM are exercised by waterLifecycle.mount.test.mjs.
const mocks = {
  api: 'export const reservationApi = globalThis.__waterLifecycleTest.api;',
  query: 'export const useQueryClient = () => globalThis.__waterLifecycleTest.queryClient;',
  utility: 'export const useUtilityLatestReading = (type,roomId) => ({data:{reading:{reading:roomId === "room-2" ? (type === "water" ? 900 : 9000) : (type === "water" ? 106 : 1250)}}});',
  notification: 'export const showNotification = (...args) => globalThis.__waterLifecycleTest.notifications.push(args);',
  css: 'export default {};',
};
export async function resolve(specifier, context, nextResolve) {
  let mock;
  if (/shared\/api\/(apiClient|reservationApi)(\.js)?$/.test(specifier)) mock = 'api';
  if (specifier === '@tanstack/react-query') mock = 'query';
  if (/\/useUtility(\.js)?$/.test(specifier)) mock = 'utility';
  if (/\/notification(\.js)?$/.test(specifier)) mock = 'notification';
  if (specifier.endsWith('.css')) mock = 'css';
  if (mock) return {url:`water-test:${mock}`,shortCircuit:true};
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (!specifier.startsWith('.')) throw error;
    for (const extension of ['.jsx','.js']) {
      const url = new URL(specifier + extension, context.parentURL);
      try { if ((await stat(url)).isFile()) return {url:url.href,shortCircuit:true}; } catch {}
    }
    throw error;
  }
}
export async function load(url, context, nextLoad) {
  if (url.startsWith('water-test:')) return {format:'module',source:mocks[url.slice(11)],shortCircuit:true};
  return loadJsx(url, context, nextLoad);
}
