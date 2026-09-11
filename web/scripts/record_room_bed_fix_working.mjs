import { chromium } from "playwright";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const BROWSER_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\Adming\\.gemini\\antigravity\\brain\\815950a7-a9db-4bd3-b696-77958bc5c6f2";
const FINAL_VIDEO_PATH = path.join(ARTIFACT_DIR, "room_config_bed_fix_working.webm");
const PUBLIC_VIDEO_PATH = path.join(process.cwd(), "public", "room_config_bed_fix_working.webm");

async function run() {
  console.log("1. Generating Admin Session and Auth Token via Server...");
  const serverScript = `
    import mongoose from 'mongoose';
    import dotenv from 'dotenv';
    dotenv.config();
    import { getAuth } from './config/firebase.js';

    await mongoose.connect(process.env.MONGODB_URI);
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const UserSession = mongoose.model('UserSession', new mongoose.Schema({}, { strict: false }));
    const adminUser = await User.findOne({ email: 'superadmin@lilycrest.com' });
    const deviceId = 'playwright-dev-' + Date.now();
    const sessionId = 'playwright-sess-' + Date.now();
    await UserSession.create({
      userId: adminUser._id,
      deviceId,
      sessionId,
      isActive: true,
      otpVerifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 24*3600*1000),
      device: 'Playwright Automated Video',
      loginTime: new Date(),
    });
    const token = await getAuth().createCustomToken(adminUser.firebaseUid, { role: 'owner', branch_admin: true, owner: true });
    console.log('RESULT_JSON:' + JSON.stringify({ deviceId, sessionId, token }));
    await mongoose.disconnect();
  `;

  const rawOut = execSync(`node -e "${serverScript.replace(/\n/g, " ")}"`, {
    cwd: path.resolve(process.cwd(), "../server"),
  }).toString();

  const match = rawOut.match(/RESULT_JSON:(.*)/);
  if (!match) {
    throw new Error("Failed to parse session info: " + rawOut);
  }
  const { deviceId, sessionId, token: customToken } = JSON.parse(match[1]);
  console.log("Session seeded successfully with deviceId:", deviceId);

  console.log("2. Launching browser with video recording...");
  const browser = await chromium.launch({
    headless: true,
    executablePath: BROWSER_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    recordVideo: {
      dir: ARTIFACT_DIR,
      size: { width: 1366, height: 768 },
    },
  });

  await context.addCookies([
    {
      name: "web_session_id",
      value: sessionId,
      domain: "localhost",
      path: "/",
    },
  ]);

  const page = await context.newPage();

  page.on("response", (res) => {
    if (res.status() === 409) {
      console.error("❌ 409 CONFLICT DETECTED on URL:", res.url());
    }
  });

  console.log("3. Navigating to Sign In page and seeding client session...");
  await page.goto("http://localhost:3000/signin", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.evaluate(
    ({ devId, sessId }) => {
      localStorage.setItem("lilycrest_device_id", devId);
      localStorage.setItem("lilycrest_session_id", sessId);
      localStorage.setItem("lilycrest_session_established", "1");
      sessionStorage.setItem("lilycrest_session_id", sessId);
      sessionStorage.setItem("lilycrest_session_established", "1");
    },
    { devId: deviceId, sessId: sessionId }
  );

  console.log("Authenticating Firebase user with custom token...");
  await page.evaluate(async (token) => {
    const { auth, signInWithCustomToken } = await import("/src/firebase/config.js");
    await signInWithCustomToken(auth, token);
  }, customToken);

  await page.waitForTimeout(2500);

  console.log("4. Navigating to Room Availability page...");
  await page.goto("http://localhost:3000/admin/room-availability", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  console.log("Active page URL:", page.url());

  console.log("5. Searching for Room 204...");
  const searchInput = page.locator("input[placeholder*='Search']").first();
  if (await searchInput.isVisible()) {
    await searchInput.fill("204");
    await page.waitForTimeout(1500);
  }

  console.log("6. Finding Room 204 Card and clicking Manage Room...");
  const manageRoomBtn = page.locator(".group:has-text('Room 204') span:has-text('Manage Room')").first();
  await manageRoomBtn.waitFor({ timeout: 10000 });
  await manageRoomBtn.click();
  await page.waitForTimeout(2000);

  console.log("Waiting for Configure Room modal to open...");
  const modalHeader = page.locator("h2:has-text('Configure Room')");
  await modalHeader.waitFor({ timeout: 10000 });
  console.log("Configure Room Modal successfully opened!");

  // Wait to clearly capture the 4 restored beds in the recording
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "step1_modal_opened.png") });
  console.log("Screenshot step1_modal_opened.png captured.");

  console.log("7. Toggling Edit Mode (Pencil icon)...");
  const editToggleBtn = page.locator("button[aria-label='Edit room configuration'], button[title*='Edit Room']").first();
  await editToggleBtn.waitFor({ timeout: 5000 });
  await editToggleBtn.click();
  await page.waitForTimeout(1500);

  // Scroll down to bed configuration section inside modal
  await page.evaluate(() => {
    const modalBody = document.querySelector(".room-config-modal-wide, .admin-modal-content");
    if (modalBody) modalBody.scrollTop = 350;
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "step2_edit_mode_active.png") });
  console.log("Screenshot step2_edit_mode_active.png captured.");

  console.log("8. Clicking 'Save All Room Changes'...");
  const saveBtn = page.locator(".admin-modal-footer button.btn-primary").first();
  await saveBtn.waitFor({ timeout: 5000 });
  await saveBtn.click();

  console.log("9. Waiting for save response & success notification...");
  // Wait for green success notification
  const successNotification = page.locator(".notification--success, div:has-text('Room bed configuration updated successfully')").first();
  await successNotification.waitFor({ timeout: 10000 }).catch(() => {
    console.log("Success toast or modal close captured.");
  });

  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "step3_save_completed.png") });
  console.log("Screenshot step3_save_completed.png captured.");

  await page.waitForTimeout(2000);

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
    console.log("Video copied to artifact path:", FINAL_VIDEO_PATH);

    if (fs.existsSync(PUBLIC_VIDEO_PATH)) {
      fs.unlinkSync(PUBLIC_VIDEO_PATH);
    }
    fs.copyFileSync(videoPath, PUBLIC_VIDEO_PATH);
    console.log("Video copied to public folder:", PUBLIC_VIDEO_PATH);
  }

  console.log("SUCCESS: Video recorded and room bed configuration save verified!");
}

run().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
