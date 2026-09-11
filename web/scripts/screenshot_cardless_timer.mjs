import { chromium } from "playwright";
import path from "path";

const BROWSER_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\Adming\\.gemini\\antigravity\\brain\\f05dab92-7df7-42ec-a676-a82b570fb4ed";

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: BROWSER_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  // Render the payment step without nested card
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #f8fafc; }
        </style>
      </head>
      <body class="p-8">
        <div class="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 shadow-xs">
          <!-- Step Header -->
          <div class="pb-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-emerald-600">Stage 4 of 5</span>
              <h1 class="text-2xl font-extrabold text-slate-900 mt-1">Slot Reservation Fee</h1>
            </div>
            <span class="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">Room 204 • Bed B</span>
          </div>

          <!-- Live Room Hold Timer (Cardless / Frameless inline row) -->
          <div class="w-full py-3 my-2 bg-transparent text-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-start sm:items-center gap-2.5">
              <span class="w-2.5 h-2.5 rounded-full mt-1 sm:mt-0 flex-shrink-0 bg-emerald-500"></span>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold tracking-tight text-slate-900">Temporary Room Hold</span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">
                  Complete your reservation fee payment before this room hold window expires.
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-white border border-slate-200 text-slate-800 shadow-2xs">
                <svg class="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>14:49</span>
              </div>
            </div>
          </div>

          <!-- Room Details & Pricing Box -->
          <div class="mt-4 p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-slate-600">Slot Reservation Fee</span>
              <span class="font-bold text-slate-900">PHP 2,000.00</span>
            </div>
            <div class="flex justify-between text-xs text-slate-500">
              <span>Security & Encryption</span>
              <span class="text-emerald-600 font-medium">PayMongo 256-bit SSL</span>
            </div>
            <div class="pt-3 border-t border-slate-200 flex justify-between items-baseline">
              <span class="font-bold text-slate-900 text-sm">Total Due Now</span>
              <span class="text-xl font-extrabold text-emerald-600">PHP 2,000.00</span>
            </div>
          </div>

          <!-- Pay Button -->
          <button class="w-full mt-6 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors shadow-xs">
            Pay PHP 2,000.00 Securely
          </button>
        </div>
      </body>
    </html>
  `);

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "demo_cardless_timer_fixed.png") });
  console.log("Captured cardless timer screenshot!");

  await browser.close();
}

run().catch(console.error);
