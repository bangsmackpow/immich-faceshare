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
