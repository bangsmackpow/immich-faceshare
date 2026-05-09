import nodemailer from "nodemailer";
import { logger } from "./logger.js";

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendApprovalNotification(
  email: string,
  personName: string,
  status: "approved" | "denied",
): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    logger.warn("SMTP not configured — skipping email notification");
    return false;
  }

  const from = process.env.SMTP_FROM ?? "noreply@faceshare.local";
  const subject =
    status === "approved"
      ? `Access approved — photos of ${personName}`
      : `Access denied — photos of ${personName}`;

  const text =
    status === "approved"
      ? `You now have access to view photos of ${personName}. Log in to FaceShare to see them.`
      : `Your request to access photos of ${personName} has been denied.`;

  try {
    await transport.sendMail({ from, to: email, subject, text });
    logger.info({ email, personName, status }, "notification sent");
    return true;
  } catch (err) {
    logger.error(err, "failed to send email notification");
    return false;
  }
}

export async function sendShareNotification(
  email: string,
  personName: string,
  shareUrl: string,
  accessCode: string,
): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    logger.warn("SMTP not configured — skipping share email notification");
    return false;
  }

  const from = process.env.SMTP_FROM ?? "noreply@faceshare.local";

  try {
    await transport.sendMail({
      from,
      to: email,
      subject: `You've been shared a photo of ${personName}`,
      text: `Someone has shared a photo of ${personName} with you.\n\nVisit this link and enter your access code to view it:\n${shareUrl}\n\nYour access code: ${accessCode}\n\nThis link expires in 7 days.`,
    });
    logger.info({ email, personName }, "share notification sent");
    return true;
  } catch (err) {
    logger.error(err, "failed to send share notification");
    return false;
  }
}

export async function sendWelcomeEmail(
  email: string,
  name: string,
  password: string,
  grantedPeople: string[] = [],
): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    logger.warn("SMTP not configured — skipping welcome email");
    return false;
  }

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  const accessList =
    grantedPeople.length > 0
      ? `You already have access to:\n${grantedPeople.map((p) => `  • ${p}`).join("\n")}\n`
      : "";

  const text = `Welcome to FaceShare, ${name}!

Your account has been created. Here are your login details:

Email: ${email}
Password: ${password}

Login here: ${frontendUrl}/login

${accessList}What you can do in FaceShare:
• Browse people in the directory and request access to their photos
• View approved photos in a clean gallery with EXIF details
• Download photos of people you have access to
• Share individual photos via email with a secure access code
• All shared links expire after 7 days

If you have any questions, contact your administrator.`;

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "noreply@faceshare.local",
      to: email,
      subject: "Welcome to FaceShare — your account is ready",
      text,
    });
    logger.info({ email, name }, "welcome email sent");
    return true;
  } catch (err) {
    logger.error(err, "failed to send welcome email");
    return false;
  }
}

export async function sendDownloadReadyNotification(
  email: string,
  personName: string,
  expiresAt: string,
): Promise<boolean> {
  const transport = getTransport();
  if (!transport) return false;

  const from = process.env.SMTP_FROM ?? "noreply@faceshare.local";

  try {
    await transport.sendMail({
      from,
      to: email,
      subject: `Your download of ${personName}'s photos is ready`,
      text: `Your download of ${personName}'s photos is ready. This link expires at ${expiresAt}. Log in to FaceShare to download.`,
    });
    return true;
  } catch (err) {
    logger.error(err, "failed to send download notification");
    return false;
  }
}
