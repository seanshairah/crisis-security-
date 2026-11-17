import { secretMatches } from "@/lib/security/secrets";
import type { SmsProvider, SendResult, WebhookRequest, InboundMessage } from "../provider";
import { parseBody, providerConfig } from "../provider";

/**
 * Africa's Talking — covers Econet, NetOne and Telecel in Zimbabwe with two-way SMS.
 * Outbound: POST https://api.africastalking.com/version1/messaging
 * Inbound:  the dashboard "Incoming messages" callback posts form fields
 *           from, to, text, date, id, linkId. We require X-Webhook-Secret in a private request header.
 */
export class AfricasTalkingProvider implements SmsProvider {
  readonly name = "africastalking";

  async sendSMS(to: string, body: string): Promise<SendResult> {
    const cfg = providerConfig();
    const username = cfg.apiSecret || "sandbox"; // AT uses username + apiKey
    const url =
      username === "sandbox"
        ? "https://api.sandbox.africastalking.com/version1/messaging"
        : "https://api.africastalking.com/version1/messaging";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apiKey: cfg.apiKey,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username,
          to,
          message: body,
          ...(cfg.senderId ? { from: cfg.senderId } : {}),
        }),
      });
      const json = (await res.json()) as {
        SMSMessageData?: { Recipients?: { messageId?: string; status?: string }[] };
      };
      const r = json.SMSMessageData?.Recipients?.[0];
      if (!res.ok || !r || !/success/i.test(r.status ?? ""))
        return { ok: false, error: r?.status ?? `HTTP ${res.status}` };
      return { ok: true, providerMessageId: r.messageId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async verifyWebhook(req: WebhookRequest): Promise<boolean> {
    const { webhookSecret } = providerConfig();
    return secretMatches(webhookSecret, req.headers.get("x-webhook-secret"));
  }

  async parseInbound(req: WebhookRequest): Promise<InboundMessage[]> {
    const b = parseBody(req);
    if (!b.from || !b.text) return [];
    return [
      {
        from: b.from,
        to: b.to,
        body: b.text,
        providerMessageId: b.id,
        receivedAt: b.date ? new Date(b.date) : undefined,
      },
    ];
  }

  webhookResponse(): Response {
    return new Response("OK", { status: 200 });
  }
}
