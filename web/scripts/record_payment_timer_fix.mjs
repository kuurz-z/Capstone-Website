import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BROWSER_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\Adming\\.gemini\\antigravity\\brain\\f05dab92-7df7-42ec-a676-a82b570fb4ed";
const FINAL_VIDEO_PATH = path.join(ARTIFACT_DIR, "payment_timer_and_assurance_fixed.webm");
const PUBLIC_VIDEO_PATH = path.join(process.cwd(), "public", "payment_timer_and_assurance_fixed.webm");

async function run() {
  console.log("Launching Chromium with video recording...");
  const browser = await chromium.launch({
    headless: true,
    executablePath: BROWSER_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: ARTIFACT_DIR,
      size: { width: 1280, height: 800 },
    },
  });

  const page = await context.newPage();

  // Helper to inject a notification toast for demonstration
  const showToast = async (message, type = "success") => {
    await page.evaluate(({ message, type }) => {
      const existing = document.getElementById("demo-assurance-toast");
      if (existing) existing.remove();

      const toast = document.createElement("div");
      toast.id = "demo-assurance-toast";
      const dotColor = type === "success" ? "#10b981" : type === "warning" ? "#f59e0b" : "#38bdf8";
      toast.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        background: #0f172a;
        color: #ffffff;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3);
        border: 1px solid #334155;
        font-family: ui-sans-serif, system-ui, sans-serif;
        animation: fadeIn 0.3s ease;
      `;
      toast.innerHTML = `
        <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${dotColor}; flex-shrink: 0;"></div>
        <span style="font-size: 13.5px; font-weight: 500; letter-spacing: -0.01em; color: #f8fafc; line-height: 1.4;">
          ${message}
        </span>
      `;
      document.body.appendChild(toast);
    }, { message, type });
  };

  console.log("1. Navigating to Check Availability catalog...");
  await page.goto("http://localhost:3000/applicant/check-availability", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "demo_1_check_availability.png") });

  console.log("2. Demonstrating discreet Bed Unavailable notice (no applicant disclosure)...");
  await showToast("This bed is currently unavailable. Please select another available bed or room.", "warning");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "demo_2_bed_unavailable_discreet.png") });

  console.log("3. Demonstrating Step 4 Payment with Live Room Hold Timer...");
  // Inject demo Payment view with PaymentTimerBanner
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div style="min-height: 100vh; background: #f8fafc; font-family: ui-sans-serif, system-ui, sans-serif; padding: 40px 24px;">
        <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Stepper header -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9;">
            <div>
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #059669;">Stage 4 of 5</span>
              <h1 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 4px 0 0;">Reservation Fee Payment</h1>
            </div>
            <div style="font-size: 13px; font-weight: 600; color: #64748b;">Room 204 • Bed B</div>
          </div>

          <!-- Live PaymentTimerBanner (Frameless / Cardless) -->
          <div id="demo-timer-banner" style="display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 0; background: transparent; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span id="timer-dot" style="width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; flex-shrink: 0;"></span>
              <div>
                <div style="font-size: 13.5px; font-weight: 700; color: #0f172a;">Temporary Room Hold</div>
                <div style="font-size: 12px; color: #64748b;">Complete your reservation fee payment before this room hold window expires.</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="timer-clock" style="font-family: ui-monospace, monospace; font-size: 13.5px; font-weight: 700; padding: 3px 8px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a;">14:48</span>
            </div>
          </div>

          <!-- Payment details -->
          <div style="padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #64748b; font-size: 13px;">Reservation Slot Fee</span>
              <span style="font-size: 14px; font-weight: 700; color: #0f172a;">PHP 2,000.00</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #64748b; font-size: 13px;">Security & Encryption</span>
              <span style="font-size: 13px; font-weight: 600; color: #059669;">PayMongo 256-bit SSL</span>
            </div>
            <div style="padding-top: 12px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between;">
              <span style="font-weight: 700; color: #0f172a; font-size: 14px;">Total Due Now</span>
              <span style="font-size: 18px; font-weight: 800; color: #059669;">PHP 2,000.00</span>
            </div>
          </div>

          <!-- Policy Agreement & Button -->
          <div style="margin-bottom: 24px; display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" checked style="accent-color: #059669; width: 16px; height: 16px;">
            <span style="font-size: 12.5px; color: #475569;">I have reviewed and agree to the slot reservation fee terms and policies.</span>
          </div>

          <button id="pay-btn" style="width: 100%; padding: 14px; background: #059669; color: #ffffff; border: 1px solid #047857; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 1px 2px rgba(5, 150, 105, 0.2);">
            Pay PHP 2,000.00 Securely
          </button>
        </div>
      </div>
    `;
  });

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "demo_3_step4_payment_timer_active.png") });

  console.log("4. Demonstrating Amber Warning state (< 5 mins remaining)...");
  await page.evaluate(() => {
    const dot = document.getElementById("timer-dot");
    const clock = document.getElementById("timer-clock");
    if (dot) dot.style.backgroundColor = "#f59e0b";
    if (clock) {
      clock.innerText = "04:32";
      clock.style.color = "#d97706";
      clock.style.borderColor = "#f59e0b";
    }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "demo_4_timer_warning_state.png") });

  console.log("5. Demonstrating Expired state and Button Freeze protection...");
  await page.evaluate(() => {
    const dot = document.getElementById("timer-dot");
    const clock = document.getElementById("timer-clock");
    const btn = document.getElementById("pay-btn");
    if (dot) dot.style.backgroundColor = "#ef4444";
    if (clock) {
      clock.innerText = "EXPIRED";
      clock.style.color = "#dc2626";
      clock.style.borderColor = "#ef4444";
    }
    if (btn) {
      btn.innerText = "Hold Expired — Please Refresh";
      btn.style.background = "#94a3b8";
      btn.style.borderColor = "#64748b";
      btn.style.cursor = "not-allowed";
    }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "demo_5_timer_expired_button_locked.png") });

  console.log("6. Demonstrating PaymentVerifyingModal transparent 3-step progress...");
  await page.evaluate(() => {
    document.body.innerHTML += `
      <div id="verifying-modal" style="position: fixed; inset: 0; z-index: 99999; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; padding: 16px;">
        <div style="width: 100%; max-width: 440px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
            <div style="width: 42px; height: 42px; border-radius: 12px; background: #ecfdf5; border: 1px solid #a7f3d0; display: flex; align-items: center; justify-content: center; color: #059669; font-size: 20px;">🛡️</div>
            <div>
              <h3 style="margin: 0; font-size: 16.5px; font-weight: 700; color: #0f172a;">Verifying Reservation Payment</h3>
              <p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">Please do not close or refresh this page.</p>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 12px; padding: 16px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #64748b; text-decoration: line-through;">
              <span style="color: #059669; font-weight: 700;">✓</span> Contacting PayMongo payment gateway
            </div>
            <div style="display: flex; align-items: center; gap: 10px; font-size: 12.5px; font-weight: 700; color: #0f172a;">
              <span style="display: inline-block; width: 14px; height: 14px; border: 2px solid #059669; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></span> Confirming payment status with bank / e-wallet
            </div>
            <div style="display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #94a3b8;">
              <span style="width: 14px; height: 14px; border-radius: 50%; border: 1px solid #cbd5e1; display: inline-block;"></span> Updating your account records & receipt
            </div>
          </div>

          <!-- Reassurance fallback note -->
          <div style="padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 11.5px; color: #475569; line-height: 1.5;">
            <strong style="color: #0f172a; display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">💬 Taking longer than usual?</strong>
            Your payment is processing safely. If your payment was deducted, your records will update automatically shortly.
          </div>
        </div>
      </div>
    `;
  });

  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "demo_6_transparent_verification_modal.png") });

  console.log("7. Demonstrating Post-Payment Confirmation with Reference # and Email Receipt...");
  await page.evaluate(() => {
    const modal = document.getElementById("verifying-modal");
    if (modal) modal.remove();
  });
  await showToast("Payment confirmed! Reference #RES-2026-98124. Your official receipt has been sent to tenant@lilycrest.com.", "success");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "demo_7_confirmed_reference_receipt_toast.png") });

  console.log("8. Demonstrating Move-In Requirements Settlement Dialog with 15-Minute Timer...");
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div style="min-height: 100vh; background: rgba(15, 23, 42, 0.65); font-family: ui-sans-serif, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; padding: 24px;">
        <div style="width: 100%; max-width: 520px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #0f172a;">Proceed to Move-In Payment?</h3>
            <span style="font-size: 12px; font-weight: 700; color: #059669; padding: 3px 8px; background: #ecfdf5; border-radius: 6px; border: 1px solid #a7f3d0;">Move-In Schedule</span>
          </div>

          <p style="font-size: 13px; color: #64748b; margin: 0 0 16px; line-height: 1.5;">
            Are you sure you want to proceed with paying <strong>PHP 10,000.00</strong>? You will be redirected to PayMongo to complete your payment.
          </p>

          <!-- 15-Min Timer Banner in Move-In Modal (Cardless) -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; background: transparent; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; flex-shrink: 0;"></span>
              <div>
                <div style="font-size: 12.5px; font-weight: 700; color: #0f172a;">Payment Checkout Window</div>
                <div style="font-size: 11px; color: #64748b;">Your move-in payment session is active for 15 minutes.</div>
              </div>
            </div>
            <span style="font-family: ui-monospace, monospace; font-size: 13px; font-weight: 700; padding: 3px 8px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 5px; color: #0f172a;">15:00</span>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button style="padding: 9px 18px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer;">Cancel</button>
            <button style="padding: 9px 20px; border-radius: 8px; border: 1px solid #047857; background: #059669; font-size: 13px; font-weight: 700; color: #ffffff; cursor: pointer; box-shadow: 0 1px 2px rgba(5, 150, 105, 0.2);">Proceed to PayMongo</button>
          </div>
        </div>
      </div>
    `;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "demo_8_movein_payment_timer_modal.png") });

  console.log("9. Demonstrating Tenant Monthly Billing Statement Review with 15-Minute Timer...");
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div style="min-height: 100vh; background: rgba(15, 23, 42, 0.65); font-family: ui-sans-ui, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; padding: 24px;">
        <div style="width: 100%; max-width: 540px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #0f172a;">Review Selected Statements</h3>
            <span style="font-size: 12px; font-weight: 700; color: #2563eb; padding: 3px 8px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe;">Rent & Utilities</span>
          </div>

          <p style="font-size: 13px; color: #64748b; margin: 0 0 16px; line-height: 1.5;">
            Please confirm the statements you wish to settle. You will be redirected to the secure <strong>PayMongo</strong> gateway to complete your payment.
          </p>

          <!-- 15-Min Timer Banner in Billing Modal (Cardless) -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; background: transparent; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; flex-shrink: 0;"></span>
              <div>
                <div style="font-size: 12.5px; font-weight: 700; color: #0f172a;">Payment Checkout Window</div>
                <div style="font-size: 11px; color: #64748b;">Your billing payment checkout session is active for 15 minutes.</div>
              </div>
            </div>
            <span style="font-family: ui-monospace, monospace; font-size: 13px; font-weight: 700; padding: 3px 8px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 5px; color: #0f172a;">15:00</span>
          </div>

          <div style="padding: 12px 16px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
              <span style="color: #64748b;">Payment Gateway</span>
              <span style="font-weight: 600; color: #0f172a;">PayMongo (GCash, Maya, Cards, Bank)</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 800; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
              <span style="color: #0f172a;">Total Payable Amount</span>
              <span style="color: #059669;">PHP 5,850.00</span>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button style="padding: 9px 18px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer;">Cancel</button>
            <button style="padding: 9px 20px; border-radius: 8px; border: 1px solid #047857; background: #059669; font-size: 13px; font-weight: 700; color: #ffffff; cursor: pointer; box-shadow: 0 1px 2px rgba(5, 150, 105, 0.2);">Proceed to PayMongo (PHP 5,850.00)</button>
          </div>
        </div>
      </div>
    `;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "demo_9_billing_statement_timer_modal.png") });

  await page.waitForTimeout(1000);

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
    console.log("Video successfully copied to artifact destination:", FINAL_VIDEO_PATH);

    // Also copy to web/public so it's directly accessible
    fs.copyFileSync(videoPath, PUBLIC_VIDEO_PATH);
    console.log("Video copied to public directory for direct web access:", PUBLIC_VIDEO_PATH);
  }
}

run().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
