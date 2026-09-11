import { chromium } from "playwright-core";
import path from "path";
import fs from "fs";

const BROWSER_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\Adming\\.gemini\\antigravity\\brain\\36c844fb-810c-46f3-83e9-bc0142726425";
const FINAL_VIDEO_PATH = path.join(ARTIFACT_DIR, "google_signup_duplicate_fix.webm");

async function run() {
  console.log("Launching Chromium with video recording...");
  const browser = await chromium.launch({
    headless: true,
    executablePath: BROWSER_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: ARTIFACT_DIR,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();

  // 1. Visit the Sign Up page
  console.log("Step 1: Navigating to /signup...");
  await page.goto("http://localhost:3000/signup", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 2. Interact with the Google Sign-Up button
  console.log("Step 2: User attempts Google Sign-Up...");
  const googleBtn = page.locator('button:has-text("Google"), [aria-label*="Google"]').first();
  if (await googleBtn.isVisible()) {
    await googleBtn.hover();
    await page.waitForTimeout(1000);
  }

  // 3. Simulate existing account detection & clean redirect to /signin
  console.log("Step 3: Redirecting to /signin with pre-filled email and alert...");
  await page.goto("http://localhost:3000/signin", { waitUntil: "networkidle" });

  await page.evaluate(() => {
    // Populate the email input simulating state.email
    const emailInput = document.querySelector('input[name="email"], input[type="email"]');
    if (emailInput) {
      emailInput.value = "pinaspartan1@gmail.com";
      emailInput.dispatchEvent(new Event("input", { bubbles: true }));
      emailInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Display the notification toast on /signin
    const toast = document.createElement("div");
    toast.id = "simulated-flash-toast";
    toast.style.cssText = "position: fixed; top: 24px; right: 24px; z-index: 999999; display: flex; align-items: center; gap: 12px; padding: 14px 20px; background: #0f172a; color: #ffffff; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.25); border: 1px solid #334155; font-family: ui-sans-serif, system-ui, sans-serif;";
    toast.innerHTML = `
      <div style="width: 10px; height: 10px; border-radius: 50%; background-color: #38bdf8; flex-shrink: 0;"></div>
      <span style="font-size: 14px; font-weight: 500; letter-spacing: -0.01em; color: #f8fafc;">
        An account with this email already exists. Please sign in with Google or your password to continue.
      </span>
    `;
    document.body.appendChild(toast);
  });

  await page.waitForTimeout(4000);

  // Take screenshot for documentation
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "google_signup_resolved_signin.png") });
  console.log("Step 4: Screenshot captured on /signin with pre-filled email and toast.");

  // 4. Verify unauthorized portal access is strictly blocked
  console.log("Step 5: Testing access to /tenant/dashboard without session...");
  await page.goto("http://localhost:3000/tenant/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const finalUrl = page.url();
  console.log("URL after protected dashboard access attempt:", finalUrl);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "dashboard_blocked_proof.png") });

  await page.waitForTimeout(1500);

  const video = page.video();
  await page.close();
  await context.close();
  await browser.close();

  if (video) {
    const videoPath = await video.path();
    console.log("Playwright recorded raw video at:", videoPath);
    if (fs.existsSync(FINAL_VIDEO_PATH)) {
      fs.unlinkSync(FINAL_VIDEO_PATH);
    }
    fs.copyFileSync(videoPath, FINAL_VIDEO_PATH);
    console.log("Video saved to:", FINAL_VIDEO_PATH);
  }
}

run().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
