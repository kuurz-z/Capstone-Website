/**
 * =============================================================================
 * EMAIL SERVICE CONFIGURATION
 * =============================================================================
 *
 * Nodemailer configuration for sending emails to customers.
 * Uses Gmail SMTP with App Password for authentication.
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to your Google Account settings
 * 2. Enable 2-Factor Authentication
 * 3. Go to Security > App passwords
 * 4. Generate a new app password for "Mail"
 * 5. Add the credentials to your .env file:
 *    - EMAIL_USER=your-gmail@gmail.com
 *    - EMAIL_PASSWORD=your-app-password (16 characters, no spaces)
 *
 * =============================================================================
 */

import nodemailer from "nodemailer";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

// =============================================================================
// TRANSPORTER CONFIGURATION
// =============================================================================

const resolveEmailConfig = () => {
  const user = String(process.env.EMAIL_USER || process.env.SMTP_USER || "").trim();
  const pass = String(process.env.EMAIL_PASSWORD || process.env.SMTP_PASS || "").trim();
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true" ||
    port === 465;

  if (!process.env.EMAIL_USER && user) process.env.EMAIL_USER = user;
  if (!process.env.EMAIL_PASSWORD && pass) process.env.EMAIL_PASSWORD = pass;

  return { user, pass, host, port, secure };
};

const emailConfig = resolveEmailConfig();
const transporterOptions = emailConfig.host
  ? {
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    }
  : {
      service: "gmail",
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    };

const transporter = nodemailer.createTransport(transporterOptions);

const isEmailConfigured = Boolean(emailConfig.user && emailConfig.pass);

console.log("[EMAIL CONFIG]", {
  configured: isEmailConfigured,
  host: emailConfig.host || "gmail (service)",
  port: emailConfig.port,
  secure: emailConfig.secure,
  sender: emailConfig.user || "(none)",
});

if (!isEmailConfigured || process.env.NODE_ENV === "test") {
  transporter.verify = () => {};
}

// Verify connection on startup
transporter.verify((error) => {
  if (error) {
    console.log("[EMAIL CONFIG] SMTP verification failed:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
    });
    console.log("[EMAIL CONFIG] Set EMAIL_USER/EMAIL_PASSWORD or SMTP_USER/SMTP_PASS to enable emails.");
  } else {
    console.log("[EMAIL CONFIG] SMTP connection verified and ready.", {
      host: emailConfig.host || "gmail",
      sender: emailConfig.user,
    });
  }
});

// =============================================================================
// RESEND — OTP EMAIL TRANSPORT
// =============================================================================

const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const OTP_FROM = String(process.env.RESEND_FROM_EMAIL || "").trim();

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

if (resendClient && OTP_FROM) {
  console.log("[EMAIL CONFIG] Resend configured.", { from: OTP_FROM });
} else {
  if (!RESEND_API_KEY) console.log("[EMAIL CONFIG] RESEND_API_KEY not set — OTP email will fail.");
  if (!OTP_FROM) console.log("[EMAIL CONFIG] RESEND_FROM_EMAIL not set — OTP email will fail.");
}

// =============================================================================
// EMAIL TEMPLATES
// =============================================================================

/**
 * Generate HTML email template for inquiry response
 */
const generateInquiryResponseEmail = (
  customerName,
  inquirySubject,
  response,
  branchName,
) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lilycrest Dormitory - Response to Your Inquiry</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Lilycrest Dormitory</h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0; font-size: 14px;">${branchName} Branch</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #333333; margin: 0 0 20px; font-size: 22px;">Hello ${customerName}!</h2>
              
              <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Thank you for reaching out to us. We have reviewed your inquiry and here is our response:
              </p>
              
              <!-- Original Inquiry -->
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="color: #888888; font-size: 12px; margin: 0 0 5px; text-transform: uppercase; letter-spacing: 1px;">Your Inquiry</p>
                <p style="color: #333333; font-size: 14px; margin: 0; font-style: italic;">${inquirySubject}</p>
              </div>
              
              <!-- Response -->
              <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="color: #888888; font-size: 12px; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 1px;">Our Response</p>
                <p style="color: #333333; font-size: 15px; margin: 0; line-height: 1.7; white-space: pre-wrap;">${response}</p>
              </div>
              
              <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 20px 0 0;">
                If you have any further questions, feel free to reply to this email or submit another inquiry through our website.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 40px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #888888; font-size: 14px; margin: 0 0 10px;">
                Best regards,<br>
                <strong style="color: #667eea;">Lilycrest Dormitory Team</strong>
              </p>
              <p style="color: #aaaaaa; font-size: 12px; margin: 15px 0 0;">
                This is an automated response. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

// =============================================================================
// EMAIL SENDING FUNCTIONS
// =============================================================================

/**
 * Send inquiry response email to customer
 *
 * @param {Object} options - Email options
 * @param {string} options.to - Customer's email address
 * @param {string} options.customerName - Customer's name
 * @param {string} options.inquirySubject - Original inquiry subject/message
 * @param {string} options.response - Admin's response message
 * @param {string} options.branchName - Branch name (Gil Puyat or Guadalupe)
 * @returns {Promise<Object>} - Email send result
 */
export const sendInquiryResponseEmail = async ({
  to,
  customerName,
  inquirySubject,
  response,
  branchName = "Lilycrest",
}) => {
  // Check if email is configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.log(
      "⚠️ Email not sent - EMAIL_USER and EMAIL_PASSWORD not configured",
    );
    return { success: false, message: "Email service not configured" };
  }
  const mailOptions = {
    from: {
      name: "Lilycrest Dormitory",
      address: process.env.EMAIL_USER,
    },
    to: to,
    subject: `Re: Your Inquiry - Lilycrest Dormitory ${branchName}`,
    html: generateInquiryResponseEmail(
      customerName,
      inquirySubject,
      response,
      branchName,
    ),
    text: `
Hello ${customerName}!

Thank you for reaching out to us. We have reviewed your inquiry and here is our response:

Your Inquiry:
${inquirySubject}

Our Response:
${response}

If you have any further questions, feel free to reply to this email or submit another inquiry through our website.

Best regards,
Lilycrest Dormitory Team
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

// =============================================================================
// RESERVATION CONFIRMED EMAIL
// =============================================================================

const generateReservationConfirmedEmail = (
  tenantName,
  reservationCode,
  roomName,
  branchName,
  moveInDate,
) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reservation Confirmed - Lilycrest Dormitory</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #0C375F 0%, #1a4a7a 100%); padding: 30px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Lilycrest Dormitory</h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0; font-size: 14px;">${branchName} Branch</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="width: 60px; height: 60px; background: #ECFDF5; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
                  <span style="font-size: 28px;">✅</span>
                </div>
              </div>
              <h2 style="color: #111827; margin: 0 0 20px; font-size: 22px; text-align: center;">Reservation Confirmed!</h2>
              <p style="color: #555555; font-size: 16px; line-height: 1.6;">Hello <strong>${tenantName}</strong>,</p>
              <p style="color: #555555; font-size: 16px; line-height: 1.6;">Your reservation has been confirmed. Here are your details:</p>
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <table style="width: 100%; font-size: 14px; color: #374151;">
                  <tr><td style="padding: 6px 0; color: #6B7280;">Reservation Code</td><td style="padding: 6px 0; font-weight: 600;">${reservationCode}</td></tr>
                  <tr><td style="padding: 6px 0; color: #6B7280;">Room</td><td style="padding: 6px 0; font-weight: 600;">${roomName}</td></tr>
                  <tr><td style="padding: 6px 0; color: #6B7280;">Branch</td><td style="padding: 6px 0; font-weight: 600;">${branchName}</td></tr>
                  <tr><td style="padding: 6px 0; color: #6B7280;">Move-in Date</td><td style="padding: 6px 0; font-weight: 600;">${moveInDate}</td></tr>
                </table>
              </div>
              <p style="color: #555555; font-size: 14px; line-height: 1.6;">Please arrive on your move-in date with your valid ID. If you have questions, contact us through the dormitory portal.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 40px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #888888; font-size: 14px; margin: 0 0 10px;">Best regards,<br><strong style="color: #0C375F;">Lilycrest Dormitory Team</strong></p>
              <p style="color: #aaaaaa; font-size: 12px; margin: 15px 0 0;">This is an automated notification. Do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

export const sendReservationConfirmedEmail = async ({
  to,
  tenantName,
  reservationCode,
  roomName,
  branchName,
  moveInDate,
  checkInDate,
}) => {
  const moveInDateLabel = moveInDate || checkInDate || "TBD";
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.log("⚠️ Email not sent — not configured");
    return { success: false, message: "Email service not configured" };
  }
  const mailOptions = {
    from: { name: "Lilycrest Dormitory", address: process.env.EMAIL_USER },
    to,
    subject: `Reservation Confirmed — ${reservationCode} | Lilycrest Dormitory`,
    html: generateReservationConfirmedEmail(
      tenantName,
      reservationCode,
      roomName,
      branchName,
      moveInDateLabel,
    ),
    text: `Hello ${tenantName}, your reservation (${reservationCode}) for ${roomName} at ${branchName} has been confirmed. Move-in: ${moveInDateLabel}. — Lilycrest Dormitory`,
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Reservation confirmed email sent to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(
      `❌ Failed to send reservation email to ${to}:`,
      error.message,
    );
    return { success: false, error: error.message };
  }
};

// =============================================================================
// VISIT APPROVED EMAIL
// =============================================================================

const generateVisitApprovedEmailHtml = (tenantName, branchName) => `
  <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',sans-serif;color:#1F2937;">
    <div style="background:#0C375F;padding:24px;text-align:center;border-radius:12px 12px 0 0;">
      <h1 style="color:#fff;margin:0;font-size:22px;">Lilycrest Dormitory</h1>
    </div>
    <div style="padding:32px 24px;background:#fff;">
      <p style="font-size:16px;margin:0 0 16px;">Hello <strong>${tenantName}</strong>,</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
        Great news! Your visit to <strong>${branchName}</strong> has been <strong>approved</strong> by our admin team.
      </p>
      <div style="background:#ECFDF5;border-left:4px solid #10B981;padding:16px 20px;border-radius:8px;margin:0 0 16px;">
        <p style="margin:0;font-size:14px;color:#065F46;">
          <strong>✓ Visit Approved</strong><br/>
          You can now proceed to the <strong>Tenant Application</strong> step in your reservation flow.
        </p>
      </div>
      <p style="font-size:14px;line-height:1.6;margin:0 0 24px;">
        Log in to your account and continue your application from your profile dashboard.
      </p>
    </div>
    <div style="padding:16px 24px;background:#F9FAFB;border-top:1px solid #E5E7EB;text-align:center;border-radius:0 0 12px 12px;">
      <p style="margin:0;font-size:11px;color:#9CA3AF;">Lilycrest Dormitory Management System</p>
    </div>
  </div>
`;

export const sendVisitApprovedEmail = async ({
  to,
  tenantName,
  branchName,
}) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.log("⚠️ Email not sent — not configured");
    return { success: false, message: "Email service not configured" };
  }
  const mailOptions = {
    from: { name: "Lilycrest Dormitory", address: process.env.EMAIL_USER },
    to,
    subject: "Visit Approved — Continue Your Application | Lilycrest Dormitory",
    html: generateVisitApprovedEmailHtml(tenantName, branchName),
    text: `Hello ${tenantName}, your visit to ${branchName} has been approved. You can now proceed to the Tenant Application step. — Lilycrest Dormitory`,
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Visit approved email sent to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(
      `❌ Failed to send visit approved email to ${to}:`,
      error.message,
    );
    return { success: false, error: error.message };
  }
};

// =============================================================================
// DOCUMENTS REJECTED EMAIL
// =============================================================================

export const sendDocumentsRejectedEmail = async ({
  to,
  tenantName,
  rejectionReason,
  branchName = "Lilycrest",
}) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    return { success: false, message: "Email service not configured" };
  }
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 40px 20px;">
      <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <tr><td style="background: linear-gradient(135deg, #0C375F 0%, #1a4a7a 100%); padding: 30px 40px; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 28px;">Lilycrest Dormitory</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px;">${branchName} Branch</p>
        </td></tr>
        <tr><td style="padding: 40px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 60px; height: 60px; background: #FEF2F2; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="font-size: 28px;">📄</span>
            </div>
          </div>
          <h2 style="color: #111827; margin: 0 0 20px; font-size: 22px; text-align: center;">Documents Need Attention</h2>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">Hello <strong>${tenantName}</strong>,</p>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">We reviewed your submitted documents and found an issue:</p>
          <div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="color: #991B1B; font-size: 14px; margin: 0; font-weight: 500;">Reason: ${rejectionReason}</p>
          </div>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">Please log in to the dormitory portal and re-upload your documents. Your reservation will remain active.</p>
        </td></tr>
        <tr><td style="background-color: #f8f9fa; padding: 25px 40px; text-align: center; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 14px; margin: 0;">Best regards,<br><strong style="color: #0C375F;">Lilycrest Dormitory Team</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
  `;
  try {
    const info = await transporter.sendMail({
      from: { name: "Lilycrest Dormitory", address: process.env.EMAIL_USER },
      to,
      subject:
        "Action Required: Documents Need Attention — Lilycrest Dormitory",
      html,
      text: `Hello ${tenantName}, your documents need attention. Reason: ${rejectionReason}. Please log in and re-upload. — Lilycrest Dormitory`,
    });
    console.log(`✅ Documents rejected email sent to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send document rejection email:`, error.message);
    return { success: false, error: error.message };
  }
};

// =============================================================================
// BILL GENERATED EMAIL
// =============================================================================

export const sendBillGeneratedEmail = async ({
  to,
  tenantName,
  billingMonth,
  totalAmount,
  dueDate,
  branchName = "Lilycrest",
  billType = "bill",
  roomName = "",
}) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    return { success: false, message: "Email service not configured" };
  }
  const normalizedBillType = String(billType || "bill").trim().toLowerCase();
  const billTypeLabel =
    normalizedBillType === "rent"
      ? "Monthly Rent"
      : normalizedBillType.charAt(0).toUpperCase() + normalizedBillType.slice(1);
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 40px 20px;">
      <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <tr><td style="background: linear-gradient(135deg, #0C375F 0%, #1a4a7a 100%); padding: 30px 40px; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 28px;">Lilycrest Dormitory</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px;">${branchName} Branch</p>
        </td></tr>
        <tr><td style="padding: 40px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 60px; height: 60px; background: #EDF4FA; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="font-size: 28px;">💳</span>
            </div>
          </div>
          <h2 style="color: #111827; margin: 0 0 20px; font-size: 22px; text-align: center;">New Bill Generated</h2>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">Hello <strong>${tenantName}</strong>,</p>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">Your ${billTypeLabel.toLowerCase()} bill has been generated:</p>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">Bill Type</p>
            <p style="color: #111827; font-size: 18px; font-weight: 600; margin: 0 0 16px;">${billTypeLabel}</p>
            ${
              roomName
                ? `<p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">Room / Bed</p><p style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 16px;">${roomName}</p>`
                : ""
            }
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">Billing Month</p>
            <p style="color: #111827; font-size: 18px; font-weight: 600; margin: 0 0 16px;">${billingMonth}</p>
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">Total Amount</p>
            <p style="color: #E7710F; font-size: 28px; font-weight: 700; margin: 0 0 16px;">₱${Number(totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">Due Date</p>
            <p style="color: #111827; font-size: 16px; font-weight: 600; margin: 0;">${dueDate}</p>
          </div>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">Please log in to the dormitory portal to view the full breakdown and make your payment. If you use bank transfer, proof of payment may be required by branch staff before the payment is considered settled.</p>
        </td></tr>
        <tr><td style="background-color: #f8f9fa; padding: 25px 40px; text-align: center; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 14px; margin: 0;">Best regards,<br><strong style="color: #0C375F;">Lilycrest Dormitory Team</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
  `;
  try {
    const info = await transporter.sendMail({
      from: { name: "Lilycrest Dormitory", address: process.env.EMAIL_USER },
      to,
      subject: `${billTypeLabel} bill for ${billingMonth} | Lilycrest Dormitory`,
      html,
      text: `Hello ${tenantName}, your ${billTypeLabel} bill for ${billingMonth} is PHP ${totalAmount}. Due: ${dueDate}. Log in to view details and payment instructions. If you use bank transfer, proof of payment may be required. - Lilycrest Dormitory`,
    });
    console.log(`✅ Bill generated email sent to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send bill email:`, error.message);
    return { success: false, error: error.message };
  }
};

export const sendUtilityChargeAvailableEmail = async ({
  to,
  tenantName,
  utilityType,
  billingMonth,
  utilityAmount,
  totalAmount,
  dueDate,
  branchName = "Lilycrest",
}) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    return { success: false, message: "Email service not configured" };
  }

  const utilityLabel = utilityType === "water" ? "Water" : "Electricity";
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 40px 20px;">
      <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <tr><td style="background: linear-gradient(135deg, #0C375F 0%, #1a4a7a 100%); padding: 30px 40px; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 28px;">Lilycrest Dormitory</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px;">${branchName} Branch</p>
        </td></tr>
        <tr><td style="padding: 40px;">
          <h2 style="color: #111827; margin: 0 0 20px; font-size: 22px; text-align: center;">${utilityLabel} Charge Available</h2>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">Hello <strong>${tenantName}</strong>,</p>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">Your ${utilityLabel.toLowerCase()} charge for ${billingMonth} is now available in the tenant portal.</p>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">${utilityLabel} Charge</p>
            <p style="color: #111827; font-size: 18px; font-weight: 600; margin: 0 0 16px;">₱${Number(utilityAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">Current Bill Total</p>
            <p style="color: #E7710F; font-size: 28px; font-weight: 700; margin: 0 0 16px;">₱${Number(totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">Due Date</p>
            <p style="color: #111827; font-size: 16px; font-weight: 600; margin: 0;">${dueDate}</p>
          </div>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">Please log in to the dormitory portal to review the updated breakdown and complete payment.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
  `;

  try {
    const info = await transporter.sendMail({
      from: { name: "Lilycrest Dormitory", address: process.env.EMAIL_USER },
      to,
      subject: `${utilityLabel} charge for ${billingMonth} | Lilycrest Dormitory`,
      html,
      text: `Hello ${tenantName}, your ${utilityLabel.toLowerCase()} charge for ${billingMonth} is now available. Current bill total: ₱${totalAmount}. Due: ${dueDate}.`,
    });
    console.log(`✅ Utility charge email sent to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Failed to send utility charge email:", error.message);
    return { success: false, error: error.message };
  }
};

// =============================================================================
// PAYMENT REMINDER EMAIL (sent 3 days before due date)
// =============================================================================

export const sendPaymentReminderEmail = async ({
  to,
  tenantName,
  billingMonth,
  totalAmount,
  dueDate,
  branchName = "Lilycrest",
}) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD)
    return { success: false, message: "Email service not configured" };
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;">
    <table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
      <tr><td style="background:linear-gradient(135deg,#0C375F 0%,#1a4a7a 100%);padding:30px 40px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:28px;">Lilycrest Dormitory</h1>
        <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;font-size:14px;">${branchName} Branch</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:60px;height:60px;background:#FEF3C7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;">
            <span style="font-size:28px;">⏰</span>
          </div>
        </div>
        <h2 style="color:#111827;margin:0 0 20px;font-size:22px;text-align:center;">Payment Reminder</h2>
        <p style="color:#555;font-size:16px;line-height:1.6;">Hello <strong>${tenantName}</strong>,</p>
        <p style="color:#555;font-size:16px;line-height:1.6;">This is a friendly reminder that your dormitory payment is due soon.</p>
        <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
          <p style="color:#6B7280;font-size:12px;text-transform:uppercase;margin:0 0 6px;">Amount Due</p>
          <p style="color:#E7710F;font-size:28px;font-weight:700;margin:0 0 12px;">₱${Number(totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
          <p style="color:#6B7280;font-size:12px;text-transform:uppercase;margin:0 0 6px;">Due Date</p>
          <p style="color:#111827;font-size:16px;font-weight:600;margin:0;">${dueDate}</p>
        </div>
        <p style="color:#555;font-size:14px;line-height:1.6;">Please complete payment through the billing portal's online checkout to avoid late penalties. If branch staff accepts an offline payment, they will record it after confirmation.</p>
      </td></tr>
      <tr><td style="background:#f8f9fa;padding:25px 40px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#888;font-size:14px;margin:0;">Best regards,<br><strong style="color:#0C375F;">Lilycrest Dormitory Team</strong></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  try {
    const info = await transporter.sendMail({
      from: { name: "Lilycrest Dormitory", address: process.env.EMAIL_USER },
      to,
      subject: `Payment Reminder — Due ${dueDate} | Lilycrest Dormitory`,
      html,
      text: `Hello ${tenantName}, reminder: your payment of ₱${totalAmount} is due on ${dueDate}. — Lilycrest Dormitory`,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Payment reminder email failed:`, error.message);
    return { success: false, error: error.message };
  }
};

// =============================================================================
// OVERDUE NOTICE EMAIL
// =============================================================================

export const sendOverdueNoticeEmail = async ({
  to,
  tenantName,
  billingMonth,
  totalAmount,
  daysLate,
  penalty,
  branchName = "Lilycrest",
}) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD)
    return { success: false, message: "Email service not configured" };
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;">
    <table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
      <tr><td style="background:linear-gradient(135deg,#991B1B 0%,#DC2626 100%);padding:30px 40px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:28px;">Lilycrest Dormitory</h1>
        <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;font-size:14px;">${branchName} Branch</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:60px;height:60px;background:#FEF2F2;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;">
            <span style="font-size:28px;">⚠️</span>
          </div>
        </div>
        <h2 style="color:#991B1B;margin:0 0 20px;font-size:22px;text-align:center;">Payment Overdue</h2>
        <p style="color:#555;font-size:16px;line-height:1.6;">Hello <strong>${tenantName}</strong>,</p>
        <p style="color:#555;font-size:16px;line-height:1.6;">Your payment is <strong>${daysLate} day${daysLate !== 1 ? "s" : ""} overdue</strong>. Penalties are being applied.</p>
        <div style="background:#FEF2F2;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
          <p style="color:#6B7280;font-size:12px;text-transform:uppercase;margin:0 0 6px;">Total Amount (incl. penalty)</p>
          <p style="color:#DC2626;font-size:28px;font-weight:700;margin:0 0 12px;">₱${Number(totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
          <p style="color:#991B1B;font-size:14px;margin:0;">Includes ₱${Number(penalty).toLocaleString("en-PH", { minimumFractionDigits: 2 })} in late penalties</p>
        </div>
        <p style="color:#555;font-size:14px;line-height:1.6;">Please settle your payment immediately to avoid further charges.</p>
      </td></tr>
      <tr><td style="background:#f8f9fa;padding:25px 40px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#888;font-size:14px;margin:0;">Best regards,<br><strong style="color:#0C375F;">Lilycrest Dormitory Team</strong></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  try {
    const info = await transporter.sendMail({
      from: { name: "Lilycrest Dormitory", address: process.env.EMAIL_USER },
      to,
      subject: `⚠️ Payment Overdue — Penalties Applying | Lilycrest Dormitory`,
      html,
      text: `Hello ${tenantName}, your payment is ${daysLate} days overdue. Total due: ₱${totalAmount} (includes ₱${penalty} penalty). — Lilycrest Dormitory`,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Overdue notice email failed:`, error.message);
    return { success: false, error: error.message };
  }
};

// =============================================================================
// PAYMENT APPROVED EMAIL
// =============================================================================

export const sendPaymentApprovedEmail = async ({
  to,
  tenantName,
  billingMonth,
  paidAmount,
  branchName = "Lilycrest",
}) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD)
    return { success: false, message: "Email service not configured" };
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;">
    <table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
      <tr><td style="background:linear-gradient(135deg,#065F46 0%,#059669 100%);padding:30px 40px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:28px;">Lilycrest Dormitory</h1>
        <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;font-size:14px;">${branchName} Branch</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:60px;height:60px;background:#ECFDF5;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;">
            <span style="font-size:28px;">✅</span>
          </div>
        </div>
        <h2 style="color:#065F46;margin:0 0 20px;font-size:22px;text-align:center;">Payment Approved!</h2>
        <p style="color:#555;font-size:16px;line-height:1.6;">Hello <strong>${tenantName}</strong>,</p>
        <p style="color:#555;font-size:16px;line-height:1.6;">Your payment of <strong>₱${Number(paidAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong> for <strong>${billingMonth}</strong> has been verified and approved.</p>
        <p style="color:#555;font-size:16px;line-height:1.6;">Thank you for your prompt payment!</p>
      </td></tr>
      <tr><td style="background:#f8f9fa;padding:25px 40px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#888;font-size:14px;margin:0;">Best regards,<br><strong style="color:#0C375F;">Lilycrest Dormitory Team</strong></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  try {
    const info = await transporter.sendMail({
      from: { name: "Lilycrest Dormitory", address: process.env.EMAIL_USER },
      to,
      subject: `Payment Approved — ${billingMonth} | Lilycrest Dormitory`,
      html,
      text: `Hello ${tenantName}, your payment of ₱${paidAmount} for ${billingMonth} has been approved. — Lilycrest Dormitory`,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Payment approved email failed:`, error.message);
    return { success: false, error: error.message };
  }
};

// =============================================================================
// PAYMENT REJECTED EMAIL
// =============================================================================

export const sendPaymentRejectedEmail = async ({
  to,
  tenantName,
  billingMonth,
  rejectionReason,
  branchName = "Lilycrest",
}) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD)
    return { success: false, message: "Email service not configured" };
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;">
    <table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
      <tr><td style="background:linear-gradient(135deg,#0C375F 0%,#1a4a7a 100%);padding:30px 40px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:28px;">Lilycrest Dormitory</h1>
        <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;font-size:14px;">${branchName} Branch</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:60px;height:60px;background:#FEF2F2;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;">
            <span style="font-size:28px;">❌</span>
          </div>
        </div>
        <h2 style="color:#991B1B;margin:0 0 20px;font-size:22px;text-align:center;">Payment Proof Rejected</h2>
        <p style="color:#555;font-size:16px;line-height:1.6;">Hello <strong>${tenantName}</strong>,</p>
        <p style="color:#555;font-size:16px;line-height:1.6;">Your payment proof for <strong>${billingMonth}</strong> was reviewed and could not be accepted.</p>
        <div style="background:#FEF2F2;border-left:4px solid #EF4444;padding:15px 20px;margin:20px 0;border-radius:0 8px 8px 0;">
          <p style="color:#991B1B;font-size:14px;margin:0;font-weight:500;">Reason: ${rejectionReason}</p>
        </div>
        <p style="color:#555;font-size:14px;line-height:1.6;">Please complete payment using the billing portal's online checkout. If you need branch-assisted offline settlement, contact the branch staff directly.</p>
      </td></tr>
      <tr><td style="background:#f8f9fa;padding:25px 40px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#888;font-size:14px;margin:0;">Best regards,<br><strong style="color:#0C375F;">Lilycrest Dormitory Team</strong></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  try {
    const info = await transporter.sendMail({
      from: { name: "Lilycrest Dormitory", address: process.env.EMAIL_USER },
      to,
      subject: `Payment Proof Rejected — ${billingMonth} | Lilycrest Dormitory`,
      html,
      text: `Hello ${tenantName}, your payment proof for ${billingMonth} was rejected. Reason: ${rejectionReason}. Please use the billing portal's online checkout for monthly payment, or contact the branch for assisted offline settlement. — Lilycrest Dormitory`,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Payment rejected email failed:`, error.message);
    return { success: false, error: error.message };
  }
};
// =============================================================================
// PAYMENT RECEIPT EMAIL (PayMongo-style receipt with Lilycrest branding)
// =============================================================================

/**
 * Safe peso formatter — avoids toLocaleString("en-PH") which garbles output
 * in Node.js environments without full ICU data (outputs Unicode separators
 * that email clients render as garbage like "±& &2&,&0&0&0&.&0&0").
 */
const fmtPeso = (n) => {
  const fixed = Number(n || 0).toFixed(2);
  const [int, dec] = fixed.split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withCommas}.${dec}`;
};

const generatePaymentReceiptHtml = ({
  tenantName,
  amount,
  description,
  billedTo,
  paymentMethod,
  paymentDate,
  referenceId,
}) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;">
    <table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
      <!-- Dark Header -->
      <tr><td style="background:#183153;padding:32px 40px;">
        <p style="color:#D4982B;font-size:13px;margin:0 0 4px;font-weight:400;">Your receipt from</p>
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:0.5px;">LILYCREST DORMITORY</h1>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px 40px;">
        <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi <strong>${tenantName}</strong>,</p>
        <p style="color:#6B7280;font-size:14px;margin:0 0 28px;line-height:1.5;">Thank you for your payment. Here's a copy of your receipt.</p>
        <!-- Order details -->
        <p style="color:#9CA3AF;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #E5E7EB;">Order details</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr>
            <td style="padding:8px 0;color:#9CA3AF;font-size:12px;text-transform:uppercase;">Amount paid</td>
            <td style="padding:8px 0;text-align:right;"></td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0 0 16px;color:#111827;font-size:28px;font-weight:700;">&#8369; ${fmtPeso(amount)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#9CA3AF;font-size:12px;text-transform:uppercase;">Description</td>
            <td style="padding:8px 0;text-align:right;"></td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0 0 16px;color:#374151;font-size:14px;">${description}</td>
          </tr>
          <!-- Billed to -->
          <tr style="border-top:1px solid #F3F4F6;">
            <td colspan="2" style="padding:12px 0 4px;color:#9CA3AF;font-size:12px;text-transform:uppercase;">Billed to</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0 0 16px;color:#374151;font-size:14px;font-weight:500;">${billedTo || tenantName}</td>
          </tr>
          <!-- Payment method + date -->
          <tr style="border-top:1px solid #F3F4F6;">
            <td style="padding:12px 0 4px;color:#9CA3AF;font-size:12px;text-transform:uppercase;width:50%;">Payment method</td>
            <td style="padding:12px 0 4px;color:#9CA3AF;font-size:12px;text-transform:uppercase;width:50%;">Date paid</td>
          </tr>
          <tr>
            <td style="padding:0 0 12px;color:#374151;font-size:14px;font-weight:500;">${paymentMethod}</td>
            <td style="padding:0 0 12px;color:#374151;font-size:14px;font-weight:500;">${paymentDate}</td>
          </tr>
          <tr style="border-top:1px solid #F3F4F6;">
            <td style="padding:12px 0 4px;color:#9CA3AF;font-size:12px;text-transform:uppercase;">Reference</td>
            <td style="padding:12px 0 4px;"></td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0 0 8px;color:#6B7280;font-size:12px;font-family:monospace;">${referenceId}</td>
          </tr>
        </table>
        <p style="color:#6B7280;font-size:13px;line-height:1.5;margin:0;">If you have any questions about this payment, contact Lilycrest Dormitory through the tenant portal.</p>
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#183153;padding:20px 40px;text-align:center;">
        <p style="color:rgba(255,255,255,0.7);font-size:11px;margin:0 0 8px;line-height:1.5;">You're receiving this e-mail because you made a payment at Lilycrest Dormitory.</p>
        <p style="color:#D4982B;font-size:14px;font-weight:600;margin:0 0 4px;">🏠 Lilycrest Dormitory</p>
        <p style="color:rgba(255,255,255,0.5);font-size:10px;margin:0;">Dormitory Management System</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

export const sendPaymentReceiptEmail = async ({
  to,
  tenantName,
  amount,
  description,
  billedTo,
  paymentMethod = "Online Payment",
  paymentDate,
  referenceId,
}) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.log("⚠️ Receipt email not sent — email not configured");
    return { success: false, message: "Email service not configured" };
  }
  const mailOptions = {
    from: { name: "Lilycrest Dormitory", address: process.env.EMAIL_USER },
    to,
    subject: `Payment Receipt — ₱${Number(amount).toLocaleString()} | Lilycrest Dormitory`,
    html: generatePaymentReceiptHtml({
      tenantName,
      amount,
      description,
      billedTo,
      paymentMethod,
      paymentDate,
      referenceId,
    }),
    text: `Hi ${tenantName}, your payment of ₱${amount} for "${description}" has been received. Reference: ${referenceId}. Date: ${paymentDate}. — Lilycrest Dormitory`,
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Receipt email sent to ${to} — ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Receipt email failed for ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

export const sendLoginOtpEmail = async ({ to, name, otp, expiresInMinutes = 10 }) => {
  if (!resendClient || !OTP_FROM) {
    console.error("[OTP EMAIL ERROR] Not sent — RESEND_API_KEY or RESEND_FROM_EMAIL is not configured");
    return { success: false, message: "Email service not configured" };
  }

  const displayName = name || "there";

  console.log("[OTP EMAIL] Sending via Resend", { to, from: OTP_FROM });

  const { data, error } = await resendClient.emails.send({
    from: OTP_FROM,
    to: [to],
    subject: "Your Lilycrest login OTP",
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,sans-serif;color:#111827;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:32px 16px;">
      <table role="presentation" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #eef0f4;overflow:hidden;">
        <tr><td style="background:#0A1628;padding:24px 28px;color:#ffffff;">
          <div style="font-size:20px;font-weight:700;">Lilycrest Dormitory</div>
          <div style="font-size:13px;color:#D4AF37;margin-top:4px;">Login verification</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:15px;">Hi ${displayName},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#374151;">Use this 6-digit code to finish signing in to your Lilycrest account.</p>
          <div style="letter-spacing:8px;font-size:32px;font-weight:700;color:#0A1628;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:18px;text-align:center;">${otp}</div>
          <p style="margin:20px 0 0;font-size:13px;color:#6B7280;">This code expires in ${expiresInMinutes} minutes. If you did not request it, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    text: `Hi ${displayName}, your Lilycrest login OTP is ${otp}. It expires in ${expiresInMinutes} minutes.`,
  });

  if (error) {
    console.error("[OTP EMAIL ERROR]", {
      to,
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
    });
    return {
      success: false,
      error: error.message,
      code: error.name,
      statusCode: error.statusCode,
    };
  }

  console.log("[OTP EMAIL] Sent successfully", { to, messageId: data.id });
  return { success: true, messageId: data.id };
};

export default transporter;
