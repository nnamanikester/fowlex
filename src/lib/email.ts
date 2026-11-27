import "server-only";

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Files sent with it: `content` is base64. */
  attachments?: { filename: string; content: string }[];
};

type Sent = Email & { at: string };
const g = globalThis as typeof globalThis & { __fowlexOutbox?: Sent[] };

/** Emails "sent" without a Resend key: printed in development, read by the e2e tests. */
export const outbox = () => (g.__fowlexOutbox ??= []);

/**
 * Sends through Resend's API when RESEND_API_KEY is set. Without it (local development and tests)
 * the email is printed to the server console and kept in the outbox instead.
 */
export async function sendEmail(email: Email) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    outbox().push({ ...email, at: new Date().toISOString() });
    console.info(`\n[email] To: ${email.to}\n[email] Subject: ${email.subject}\n${email.text}\n`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Fowlex <noreply@fowlex.com>",
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(email.attachments?.length && { attachments: email.attachments }),
    }),
  });
  if (!response.ok) throw new Error(`Resend refused the email (${response.status}): ${await response.text()}`);
}
