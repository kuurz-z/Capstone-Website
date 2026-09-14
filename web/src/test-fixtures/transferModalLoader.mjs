import { stat } from "node:fs/promises";
import { load as loadJsx } from "./jsxLoaderHooks.mjs";

// Replace network boundaries only; render the real modal and its child controls.
const mocks = {
  rooms: "export const useRooms = () => ({data: globalThis.__transferModalTest.rooms});",
  preview: "export const useRoomTransferPreview = () => globalThis.__transferModalTest.preview;",
  api: "export const reservationApi = globalThis.__transferModalTest.api;",
  notification: "export const showNotification = () => {};",
  css: "export default {};",
};

export async function resolve(specifier, context, nextResolve) {
  let mock;
  if (/\/useRooms(\.js)?$/.test(specifier)) mock = "rooms";
  if (/\/useReservations(\.js)?$/.test(specifier)) mock = "preview";
  if (/\/reservationApi(\.js)?$/.test(specifier)) mock = "api";
  if (/\/notification(\.js)?$/.test(specifier)) mock = "notification";
  if (specifier.endsWith(".css")) mock = "css";
  if (mock) return { url: `transfer-modal-test:${mock}`, shortCircuit: true };
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (!specifier.startsWith(".")) throw error;
    for (const extension of [".jsx", ".js"]) {
      const url = new URL(specifier + extension, context.parentURL);
      try {
        if ((await stat(url)).isFile()) return { url: url.href, shortCircuit: true };
      } catch {}
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("transfer-modal-test:")) {
    return { format: "module", source: mocks[url.slice("transfer-modal-test:".length)], shortCircuit: true };
  }
  return loadJsx(url, context, nextLoad);
}
