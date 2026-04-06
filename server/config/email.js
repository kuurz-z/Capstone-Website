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
import dotenv from "dotenv";

dotenv.config();

// =============================================================================
// TRANSPORTER CONFIGURATION
// =============================================================================

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const isEmailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
if (!isEmailConfigured || process.env.NODE_ENV === "test") {
  transporter.verify = () => {};
}

// Verify connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.log("⚠️ Email service not configured:", error.message);
    console.log(
      "📧 To enable email notifications, add EMAIL_USER and EMAIL_PASSWORD to .env",
    );
  } else {
    console.log("✅ Email service ready");
  }
});

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
  checkInDate,
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
                  <tr><td style="padding: 6px 0; color: #6B7280;">Check-in Date</td><td style="padding: 6px 0; font-weight: 600;">${checkInDate}</td></tr>
                </table>
              </div>
              <p style="color: #555555; font-size: 14px; line-height: 1.6;">Please arrive on your check-in date with your valid ID. If you have questions, contact us through the dormitory portal.</p>
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
  checkInDate,
}) => {
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
      checkInDate,
    ),
    text: `Hello ${tenantName}, your reservation (${reservationCode}) for ${roomName} at ${branchName} has been confirmed. Check-in: ${checkInDate}. — Lilycrest Dormitory`,
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
            <div style="width: 60px; height: 60px; background: #EDF4FA; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="font-size: 28px;">💳</span>
            </div>
          </div>
          <h2 style="color: #111827; margin: 0 0 20px; font-size: 22px; text-align: center;">New Bill Generated</h2>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">Hello <strong>${tenantName}</strong>,</p>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">Your monthly bill has been generated:</p>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">Billing Month</p>
            <p style="color: #111827; font-size: 18px; font-weight: 600; margin: 0 0 16px;">${billingMonth}</p>
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">Total Amount</p>
            <p style="color: #E7710F; font-size: 28px; font-weight: 700; margin: 0 0 16px;">₱${Number(totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin: 0 0 6px;">Due Date</p>
            <p style="color: #111827; font-size: 16px; font-weight: 600; margin: 0;">${dueDate}</p>
          </div>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">Please log in to the dormitory portal to view the full breakdown and make your payment.</p>
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
      subject: `Bill for ${billingMonth} — ₱${Number(totalAmount).toLocaleString()} | Lilycrest Dormitory`,
      html,
      text: `Hello ${tenantName}, your bill for ${billingMonth} is ₱${totalAmount}. Due: ${dueDate}. Log in to view details. — Lilycrest Dormitory`,
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
        <p style="color:#555;font-size:14px;line-height:1.6;">Please make your payment and upload proof through the dormitory portal to avoid late penalties.</p>
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
        <p style="color:#555;font-size:14px;line-height:1.6;">Please re-upload a valid payment proof through the dormitory portal.</p>
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
      text: `Hello ${tenantName}, your payment proof for ${billingMonth} was rejected. Reason: ${rejectionReason}. Please resubmit. — Lilycrest Dormitory`,
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

export default transporter;
