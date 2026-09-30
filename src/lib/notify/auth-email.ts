import "server-only";

/**
 * The emails that arrive before anyone has an account yet.
 *
 * They are sent by the application rather than by Supabase. Supabase's stock
 * auth templates are a bare line of text and a naked link, from whichever
 * address the whole project is configured with — the exact shape of a
 * phishing attempt, and mail providers treat it accordingly. A person's very
 * first message from us is the worst possible one to land in Spam.
 *
 * One shell for both, so somebody who has seen one of our emails recognises
 * the next. That recognition is most of what stops a genuine message being
 * mistaken for a forgery.
 */

function shell({
  heading,
  body,
  cta,
  link,
}: {
  heading: string;
  body: string;
  cta: string;
  link: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#161a23;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e5ee;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:.04em;color:#1d3557;">EDOSPMIS</p>
          <h1 style="margin:12px 0 0;font-size:20px;line-height:1.3;color:#161a23;">${heading}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 28px 0;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${body}</p>
          <p style="margin:0 0 20px;">
            <a href="${link}" style="display:inline-block;background:#1d3557;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600;">${cta}</a>
          </p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#545b6b;">
            If the button doesn&rsquo;t work, copy this address into your browser:
          </p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#545b6b;">${link}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 28px;border-top:1px solid #e2e5ee;">
          <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#545b6b;">
            EDOSPMIS by EDOS Centre &middot; procurement and service delivery management
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Confirming a new account. */
export function signupConfirmEmail({ link, name }: { link: string; name?: string | null }) {
  const greeting = name ? `${name}, welcome` : "Welcome";
  return {
    subject: "Confirm your EDOSPMIS account",
    html: shell({
      heading: `${greeting} to EDOSPMIS`,
      body: "Confirm this address and your workspace opens ready for its first requisition.",
      cta: "Confirm my account",
      link,
    }),
    text: [
      `${greeting} to EDOSPMIS.`,
      "",
      "Confirm your email address to open your workspace:",
      link,
      "",
      "If you did not create this account, ignore this message — nothing happens until the link is used.",
      "",
      "EDOSPMIS by EDOS Centre",
    ].join("\n"),
  };
}

/**
 * Being added to somebody else's workspace.
 *
 * Named for what it is from the reader's side: they did not ask for this, so
 * the message has to say who invited them and to what, or it is indistinguishable
 * from a phishing attempt.
 */
export function teamInviteEmail({
  link,
  workspaceName,
  invitedBy,
}: {
  link: string;
  workspaceName: string;
  invitedBy?: string | null;
}) {
  const opener = invitedBy
    ? `${invitedBy} has added you to ${workspaceName} on EDOSPMIS.`
    : `You have been added to ${workspaceName} on EDOSPMIS.`;
  return {
    subject: `You've been invited to ${workspaceName} on EDOSPMIS`,
    html: shell({
      heading: `Join ${workspaceName} on EDOSPMIS`,
      body: `${opener} Choose a password and you are in.`,
      cta: "Accept the invitation",
      link,
    }),
    text: [
      opener,
      "",
      "Use this link to choose a password and get started:",
      link,
      "",
      "If you were not expecting this, ignore the message — nothing happens until the link is used.",
      "",
      "EDOSPMIS by EDOS Centre",
    ].join("\n"),
  };
}

/** Choosing a new password. */
export function passwordResetEmail({ link }: { link: string }) {
  return {
    subject: "Reset your EDOSPMIS password",
    html: shell({
      heading: "Choose a new password",
      body: "Use the link below to set a new password. It can only be used once, and it expires shortly.",
      cta: "Choose a new password",
      link,
    }),
    text: [
      "Choose a new EDOSPMIS password.",
      "",
      "Use this link to set a new one. It works once, and expires shortly:",
      link,
      "",
      "If you did not ask for this, ignore this message — your current password still works.",
      "",
      "EDOSPMIS by EDOS Centre",
    ].join("\n"),
  };
}
