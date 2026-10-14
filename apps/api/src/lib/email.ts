import nodemailer from "nodemailer";
import { config } from "../config.js";

export interface EmailResult { sent: boolean; provider: string; messageId?: string; error?: string; preview?: string }

const outbox: { to: string; subject: string; text: string; at: string }[] = [];
export const testOutbox = outbox;

/** Configurable email sender. Never pretends success: returns sent:false when unconfigured/failing. */
export async function sendEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  const provider = config.emailProvider;
  if (provider === "log" || !config.smtp.host) {
    const preview = `[EMAIL ${provider}] to=${to} subject=${subject}\n${text}`;
    outbox.push({ to, subject, text, at: new Date().toISOString() });
    console.log(preview);
    return { sent: provider === "log" ? true : false, provider, preview, error: provider === "log" ? undefined : "Email delivery not configured (SMTP host missing)" };
  }
  try {
    const tx = nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
    const info = await tx.sendMail({ from: config.emailFrom, to, subject, text });
    return { sent: true, provider: "smtp", messageId: info.messageId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("Email send failed:", error);
    return { sent: false, provider: "smtp", error };
  }
}

export function emailStatus() {
  return {
    provider: config.emailProvider,
    configured: config.emailProvider === "log" ? true : Boolean(config.smtp.host),
    from: config.emailFrom,
  };
}
