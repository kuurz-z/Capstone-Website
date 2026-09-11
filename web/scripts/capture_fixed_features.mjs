import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BROWSER_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:/Users/Adming/.gemini/antigravity/brain/e4ca0bd3-e07c-40a9-bd73-11f27ef57fcd";
const PUBLIC_DIR = "d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/public";

async function capture() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: BROWSER_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // Screenshot 1: Expired Payment Hold with "Browse Available Rooms" button
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #f8fafc; }
        </style>
      </head>
      <body class="p-8 flex items-center justify-center min-h-screen">
        <div class="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <!-- Step Header -->
          <div class="pb-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div class="inline-flex items-center px-3 py-1 bg-slate-100 border border-slate-200 rounded-full">
              <span class="text-xs font-semibold text-slate-700 uppercase tracking-wider">Step 4 · Payment</span>
            </div>
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="text-xs font-semibold text-slate-800">Room 204 · Gil Puyat</span>
            </div>
          </div>

          <div class="mt-4">
            <h2 class="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <svg class="w-6 h-6 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
              <span>Slot Reservation Fee</span>
            </h2>
            <p class="text-xs text-slate-500 mt-1">Pay the one-time reservation fee to secure your room. 100% credited toward your move-in balance.</p>
          </div>

          <!-- Expired Hold Banner -->
          <div class="mt-4 p-4 rounded-xl border border-rose-200 bg-rose-50 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <div>
                <strong class="text-sm font-semibold text-rose-900 block">Room Hold Window Expired</strong>
                <span class="text-xs text-rose-700">The 15-minute temporary reservation lock for this slot has lapsed.</span>
              </div>
            </div>
            <span class="font-mono text-xs font-bold px-2.5 py-1 rounded bg-white border border-rose-200 text-rose-800">00:00</span>
          </div>

          <!-- Fee Summary Card -->
          <div class="mt-4 p-5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
            <div class="flex justify-between text-sm text-slate-600">
              <span>Slot Reservation Fee</span>
              <span class="font-semibold text-slate-900">PHP 2,000.00</span>
            </div>
            <div class="flex justify-between text-xs text-slate-500">
              <span>Security & Encryption</span>
              <span class="text-emerald-600 font-medium">PayMongo 256-bit SSL</span>
            </div>
            <div class="pt-3 border-t border-slate-200 flex justify-between items-baseline">
              <span class="font-bold text-slate-900 text-sm">Total Due Now</span>
              <span class="text-2xl font-black text-slate-900">PHP 2,000.00</span>
            </div>
          </div>

          <!-- Buttons Container -->
          <div class="mt-6 space-y-2.5">
            <!-- Disabled Pay Button -->
            <button disabled class="w-full py-3.5 px-4 bg-slate-200 text-slate-500 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 cursor-not-allowed">
              <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>Room Hold Expired</span>
            </button>

            <!-- New Actionable Recovery Button -->
            <button class="w-full py-3 px-4 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs">
              <svg class="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              <span>Browse Available Rooms</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  `);

  await page.waitForTimeout(500);
  const shot1Path = `${ARTIFACT_DIR}/screenshot_hold_expired_recovery.png`;
  await page.screenshot({ path: shot1Path });
  fs.copyFileSync(shot1Path, `${PUBLIC_DIR}/screenshot_hold_expired_recovery.png`);
  console.log("Captured Screenshot 1:", shot1Path);

  // Screenshot 2: Safe Inactivity Warning Modal with Protected Backdrop
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: rgba(15, 23, 42, 0.45); }
        </style>
      </head>
      <body class="flex items-center justify-center min-h-screen p-4">
        <!-- Modal Card -->
        <div class="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 relative">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div class="flex-1">
              <h3 class="text-base font-bold text-slate-900 leading-tight">Are you still working on your reservation?</h3>
              <p class="text-xs text-slate-500 mt-0.5 font-medium">Room: Room 204</p>
            </div>
          </div>

          <div class="mt-4 space-y-3 text-slate-600 text-sm">
            <p class="text-xs leading-relaxed text-slate-600">
              You have been inactive for 25 minutes. To give all applicants a fair chance, your temporary hold on <strong>Room 204</strong> will expire soon.
            </p>
            <div class="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-mono text-xs font-semibold">
              <svg class="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>Hold expires in: <strong class="text-slate-900 font-bold">04:59</strong></span>
            </div>
          </div>

          <!-- Modal Action Buttons (Cancel on left, Confirm on right) -->
          <div class="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button class="px-4 py-2 border border-slate-200 rounded-full bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Release Room
            </button>
            <button class="px-5 py-2 rounded-full bg-amber-600 hover:bg-amber-700 text-xs font-semibold text-white transition-colors shadow-xs">
              I'm still here
            </button>
          </div>
        </div>
      </body>
    </html>
  `);

  await page.waitForTimeout(500);
  const shot2Path = `${ARTIFACT_DIR}/screenshot_inactivity_modal_safe.png`;
  await page.screenshot({ path: shot2Path });
  fs.copyFileSync(shot2Path, `${PUBLIC_DIR}/screenshot_inactivity_modal_safe.png`);
  console.log("Captured Screenshot 2:", shot2Path);

  // Screenshot 3: Dorm Owner System Settings with 0.25h / 0.5h Fractional Hold Setting
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #f8fafc; }
        </style>
      </head>
      <body class="p-8 flex items-center justify-center min-h-screen">
        <div class="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <div class="pb-4 border-b border-slate-200">
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 rounded text-xs font-bold uppercase bg-slate-100 text-slate-700">Business Rules</span>
            </div>
            <h2 class="text-xl font-bold text-slate-900 mt-1">Dormitory System Settings</h2>
            <p class="text-xs text-slate-500">Configure reservation hold expiration windows and grace periods.</p>
          </div>

          <div class="mt-6 space-y-4">
            <div class="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-center justify-between">
              <div>
                <label class="block text-xs font-bold text-slate-900">Stale Pending Hours (Hold Window)</label>
                <p class="text-xs text-slate-500 mt-0.5">Duration before an incomplete applicant room reservation expires.</p>
              </div>
              <div class="w-36">
                <div class="relative rounded-lg shadow-2xs">
                  <input type="text" value="0.5" class="block w-full rounded-lg border-emerald-500 bg-white py-2 px-3 text-sm font-bold text-slate-900 text-right pr-12 focus:ring-1 focus:ring-emerald-500 border" />
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span class="text-xs text-slate-400 font-medium">hrs</span>
                  </div>
                </div>
                <span class="text-[10px] text-emerald-700 font-medium mt-1 block text-right">30 mins (Default)</span>
              </div>
            </div>

            <div class="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
              <div>
                <label class="block text-xs font-bold text-slate-900">No-Show Grace Period</label>
                <p class="text-xs text-slate-500 mt-0.5">Days before an unpaid reservation is automatically cancelled.</p>
              </div>
              <div class="w-36">
                <div class="relative rounded-lg shadow-2xs">
                  <input type="text" value="7" class="block w-full rounded-lg border-slate-200 bg-white py-2 px-3 text-sm font-bold text-slate-900 text-right pr-12 border" />
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span class="text-xs text-slate-400 font-medium">days</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span class="text-xs text-emerald-600 font-semibold flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"></path></svg>
              <span>Validation verified: accepts fractional hours down to 0.25h</span>
            </span>
            <button class="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-xs shadow-xs">
              Save Changes
            </button>
          </div>
        </div>
      </body>
    </html>
  `);

  await page.waitForTimeout(500);
  const shot3Path = `${ARTIFACT_DIR}/screenshot_settings_fractional_hold.png`;
  await page.screenshot({ path: shot3Path });
  fs.copyFileSync(shot3Path, `${PUBLIC_DIR}/screenshot_settings_fractional_hold.png`);
  console.log("Captured Screenshot 3:", shot3Path);

  await browser.close();
}

capture().catch(console.error);
