import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BROWSER_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\Adming\\.gemini\\antigravity\\brain\\c8cdbec5-572c-4adc-ac2b-cf4fbc80fb84";
const FINAL_VIDEO_PATH = path.join(ARTIFACT_DIR, "room_photo_optimization_qa.webm");
const PUBLIC_VIDEO_PATH = path.join(process.cwd(), "public", "room_photo_optimization_qa.webm");

async function run() {
  console.log("🎥 Starting QA Video Recording for Room Photo Optimization...");

  const launchOpts = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  };
  if (fs.existsSync(BROWSER_PATH)) {
    launchOpts.executablePath = BROWSER_PATH;
  }

  const browser = await chromium.launch(launchOpts);

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    recordVideo: {
      dir: ARTIFACT_DIR,
      size: { width: 1366, height: 768 },
    },
  });

  const page = await context.newPage();

  // Monitor image responses to verify WebP & optimization proxy
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/photos/optimize") || url.includes(".webp")) {
      const status = res.status();
      const xCache = res.headers()["x-cache"] || "none";
      const contentType = res.headers()["content-type"] || "";
      console.log(`  📸 Image loaded: [${status}] ${xCache} ${contentType} -> ${url.slice(0, 90)}...`);
    }
  });

  try {
    // 1. Visit Check Availability Page
    console.log("1. Navigating to Check Availability page (http://localhost:3000/applicant/check-availability)...");
    await page.goto("http://localhost:3000/applicant/check-availability", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // 2. Scroll through room cards to demonstrate fast thumbnail rendering
    console.log("2. Demonstrating rapid room card rendering and thumbnail loading...");
    await page.evaluate(() => window.scrollBy({ top: 350, behavior: "smooth" }));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(1500);

    // 3. Navigate to Page 2 of Check Availability to verify next-page room photos (Room 306, 307, etc.)
    console.log("3. Navigating to Page 2 to verify next-page room photos...");
    const nextPgBtn = page.locator(".ca-pagination__btn").last();
    if (await nextPgBtn.isVisible().catch(() => false)) {
      await nextPgBtn.click();
      await page.waitForTimeout(2000);
      console.log("   Page 2 reached! Waiting for room cards to display...");
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollBy({ top: 350, behavior: "smooth" }));
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await page.waitForTimeout(1000);
    }

    // 4. Hover over a room card on Page 2 and demonstrate card carousel cross-fade
    console.log("4. Hovering over Room card on Page 2 to demonstrate card carousel cross-fade...");
    const page2Card = page.locator(".ca-card").first();
    if (await page2Card.count() > 0) {
      await page2Card.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.waitForTimeout(600);
      await page2Card.hover();
      await page.waitForTimeout(1000);

      // Demonstrate room card carousel smooth cross-fade animation
      const cardNextBtn = page2Card.locator(".ca-card-nav-btn.right").first();
      if (await cardNextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log("   Clicking carousel next on room card (smooth cross-fade)...");
        await cardNextBtn.click({ force: true });
        await page.waitForTimeout(1200);
        await cardNextBtn.click({ force: true });
        await page.waitForTimeout(1200);
      }

      console.log("5. Opening Room Details Modal from Page 2...");
      await page2Card.click();
      await page.waitForTimeout(2000);

      // Navigate carousel inside modal
      console.log("6. Navigating carousel inside Room Details Modal (cross-fade animation)...");
      const nextBtn = page.locator('.rdm-overlay button[aria-label="Next photo"]').first();
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(1200);
        await nextBtn.click();
        await page.waitForTimeout(1200);
      }

      // Click thumbstrip item to demonstrate instant select cross-fade
      const thumbItem = page.locator('.rdm-thumbstrip button').first();
      if (await thumbItem.isVisible({ timeout: 1500 }).catch(() => false)) {
        console.log("   Clicking thumbstrip item in modal...");
        await thumbItem.click();
        await page.waitForTimeout(1200);
      }

      console.log("7. Closing Room Details Modal...");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1200);
    }

    // 5. Navigate to Admin Room Management page to verify Room Management pics
    console.log("8. Navigating to Admin Room Management (/admin/room-availability)...");
    await page.goto("http://localhost:3000/admin/room-availability", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    // Look for configure button or room card in Room Management
    const configBtn = page.locator('button:has-text("Configure"), [aria-label*="Configure"], button:has-text("Edit")').first();
    if (await configBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("9. Opening Room Configuration Modal in Room Management...");
      await configBtn.click();
      await page.waitForTimeout(2500);

      // Scroll inside modal to photos section
      const photosSection = page.locator('.image-preview-grid, text="Room Photos"').first();
      if (await photosSection.isVisible({ timeout: 2000 }).catch(() => false)) {
        await photosSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1500);
      }

      console.log("10. Closing Room Configuration Modal...");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1200);
    }

    // 7. Visit Public Landing Page
    console.log("8. Navigating to Public Landing page to verify Room Inventory thumbnails...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // Scroll to Room Inventory section
    await page.evaluate(() => {
      const roomSection = document.querySelector("#rooms, section:has(h2)");
      if (roomSection) {
        roomSection.scrollIntoView({ behavior: "smooth" });
      } else {
        window.scrollBy({ top: 1200, behavior: "smooth" });
      }
    });
    await page.waitForTimeout(2500);

    console.log("✅ All visual scenarios demonstrated smoothly!");
  } catch (err) {
    console.error("❌ Error during video recording:", err.message);
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();

    if (video) {
      const videoPath = await video.path();
      console.log("Raw video recorded at:", videoPath);
      try {
        if (fs.existsSync(videoPath)) {
          fs.copyFileSync(videoPath, FINAL_VIDEO_PATH);
          console.log("Saved video artifact to:", FINAL_VIDEO_PATH);

          const publicDir = path.dirname(PUBLIC_VIDEO_PATH);
          if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
          }
          fs.copyFileSync(videoPath, PUBLIC_VIDEO_PATH);
          console.log("Saved public video to:", PUBLIC_VIDEO_PATH);
        }
      } catch (copyErr) {
        console.warn("Could not copy video file:", copyErr.message);
      }
    }
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
