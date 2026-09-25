import "server-only";

/**
 * Thin wrapper over Resend's HTTP API — no SDK dependency, since the whole
 * call is one POST with a bearer token (same "call the HTTP API directly"
 * choice already made for the webhook dispatcher in Phase 7).
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { ok: false, error: "Email isn't configured yet (RESEND_API_KEY/RESEND_FROM_EMAIL)." };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Resend rejected the email (${res.status}): ${body.slice(0, 200)}` };
  }
  return { ok: true };
}
