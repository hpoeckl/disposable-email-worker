import { EmailMessage } from "cloudflare:email";
import { parseRecipient } from "./address-parser";
import { getSettings, addBandwidth } from "./db/settings";
import {
  getAlias,
  createAlias,
  incrementForwarded,
  incrementRejected,
  getAliasRecipientEmails,
} from "./db/aliases";
import { logFailedDelivery } from "./db/failed-deliveries";
import { listWhitelistEntries } from "./db/whitelist";
import { listRulesWithConditions } from "./db/rules";
import { incrementRuleHit } from "./db/rules";
import { rewriteHeaders } from "./header-rewriter";
import { rewriteMimeHeaders } from "./mime";
import { isWhitelisted } from "./whitelist-matcher";
import { evaluateRules } from "./rule-engine";

export interface Env {
  DB: D1Database;
  SEB: SendEmail;
  BASE_DOMAIN: string;
  ADMIN_USERS?: string;
  CF_ACCESS_TEAM?: string;
  CF_ACCESS_AUD?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
}

export async function handleEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  const parsed = parseRecipient(message.to, { baseDomain: env.BASE_DOMAIN });

  if (!parsed) {
    message.setReject("Invalid recipient address");
    return;
  }

  const { tag, user } = parsed;
  const db = env.DB;
  const sender = message.from;
  const subject = message.headers.get("subject") ?? "";
  const messageSize = message.rawSize;

  // Load user settings (auto-creates on first access)
  const settings = await getSettings(db, user);

  // Look up or auto-provision alias
  let alias = await getAlias(db, user, tag);

  if (!alias) {
    if (!settings.catch_all) {
      message.setReject("Unknown alias");
      await logFailedDelivery(db, {
        user,
        alias_tag: tag,
        sender,
        subject,
        reason: "unknown_alias",
        message_size: messageSize,
      });
      return;
    }

    // Auto-provision new alias
    alias = await createAlias(db, user, tag, settings.default_limit);
  }

  // --- Rule engine: evaluated first, short-circuits all other logic ---
  const senderDomain = sender.includes("@")
    ? sender.substring(sender.lastIndexOf("@") + 1)
    : "";
  const rules = await listRulesWithConditions(db, user);
  const ruleMatch = evaluateRules(rules, {
    sender,
    senderDomain,
    subject,
    aliasTag: tag,
  });

  if (ruleMatch) {
    await incrementRuleHit(db, ruleMatch.ruleId);

    if (ruleMatch.action === "block") {
      await logFailedDelivery(db, {
        user,
        alias_tag: tag,
        sender,
        subject,
        reason: `rule_blocked: rule ${ruleMatch.ruleId}`,
        message_size: messageSize,
      });
      return; // silently drop
    }

    if (ruleMatch.action === "reject") {
      message.setReject("Rejected by rule");
      await logFailedDelivery(db, {
        user,
        alias_tag: tag,
        sender,
        subject,
        reason: `rule_rejected: rule ${ruleMatch.ruleId}`,
        message_size: messageSize,
      });
      return;
    }

    // action === "forward": continue processing, but override recipients if set
  }

  // Check if alias is active
  if (!alias.active) {
    await incrementRejected(db, alias.id);
    message.setReject("Alias disabled");
    await logFailedDelivery(db, {
      user,
      alias_tag: tag,
      sender,
      subject,
      reason: "alias_disabled",
      message_size: messageSize,
    });
    return;
  }

  // --- Whitelist check: whitelisted senders bypass counter/bandwidth ---
  const whitelistEntries = await listWhitelistEntries(db, alias.id);
  const senderWhitelisted = isWhitelisted(sender, whitelistEntries);

  // Check counter limit (skip if whitelisted)
  if (!senderWhitelisted && alias.forwarded >= alias.limit) {
    await incrementRejected(db, alias.id);
    message.setReject("Alias expired");
    await logFailedDelivery(db, {
      user,
      alias_tag: tag,
      sender,
      subject,
      reason: "limit_reached",
      message_size: messageSize,
    });
    return;
  }

  // Check bandwidth limit (skip if whitelisted)
  if (!senderWhitelisted && settings.bandwidth_used + messageSize > settings.bandwidth_limit) {
    await incrementRejected(db, alias.id);
    message.setReject("Bandwidth limit exceeded");
    await logFailedDelivery(db, {
      user,
      alias_tag: tag,
      sender,
      subject,
      reason: "bandwidth_exceeded",
      message_size: messageSize,
    });
    return;
  }

  // Resolve forwarding recipients (rule forward_to overrides default)
  let recipients: string[] = [];

  if (ruleMatch?.action === "forward" && ruleMatch.forwardTo) {
    recipients = [ruleMatch.forwardTo];
  }

  if (recipients.length === 0) {
    recipients = await getAliasRecipientEmails(db, alias.id);
  }

  // Fallback: if no alias-specific recipients, use all verified recipients for this user
  if (recipients.length === 0) {
    const { results } = await db
      .prepare(
        "SELECT email FROM recipients WHERE user = ? AND verified_at IS NOT NULL",
      )
      .bind(user)
      .all<{ email: string }>();
    recipients = results.map((r) => r.email);
  }

  if (recipients.length === 0) {
    await incrementRejected(db, alias.id);
    message.setReject("No verified recipients configured");
    await logFailedDelivery(db, {
      user,
      alias_tag: tag,
      sender,
      subject,
      reason: "no_recipients",
      message_size: messageSize,
    });
    return;
  }

  // Rewrite headers
  const rewrite = rewriteHeaders(
    {
      sender,
      tag,
      forwarded: alias.forwarded + 1,
      limit: alias.limit,
      format: settings.from_name_format,
      noReplyAddress: `noreply@${env.BASE_DOMAIN}`,
      whitelisted: senderWhitelisted,
    },
    subject,
  );

  // Build MIME header overrides
  const mimeOverrides: Record<string, string> = {
    "Reply-To": sender,
    "X-Original-From": sender,
    "X-Alias-Tag": tag,
  };
  if (rewrite.from) {
    mimeOverrides["From"] = rewrite.from;
  }
  if (rewrite.subject) {
    mimeOverrides["Subject"] = rewrite.subject;
  }

  // Rewrite raw MIME — whitelist strips ARC/DKIM/Exchange headers that
  // Cloudflare SendEmail rejects as "invalid headers set".
  const modifiedRaw = await rewriteMimeHeaders(message.raw, mimeOverrides);

  // Forward via raw MIME EmailMessage — preserves original body/attachments
  const errors: string[] = [];
  const envelopeFrom = `noreply@${env.BASE_DOMAIN}`;
  for (const recipient of recipients) {
    try {
      const msg = new EmailMessage(
        envelopeFrom,
        recipient,
        new Blob([modifiedRaw]).stream(),
      );
      await env.SEB.send(msg);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Send failed:", errMsg);
      errors.push(`${recipient}: ${errMsg}`);
    }
  }

  if (errors.length === recipients.length) {
    // All forwards failed
    await incrementRejected(db, alias.id);
    await logFailedDelivery(db, {
      user,
      alias_tag: tag,
      sender,
      subject,
      reason: `forward_failed: ${errors.join("; ")}`,
      message_size: messageSize,
    });
    return;
  }

  // At least one forward succeeded — skip counter for whitelisted senders
  if (!senderWhitelisted) {
    await incrementForwarded(db, alias.id, messageSize);
    await addBandwidth(db, user, messageSize);
  }

  // Log partial failures
  if (errors.length > 0) {
    await logFailedDelivery(db, {
      user,
      alias_tag: tag,
      sender,
      subject,
      reason: `partial_forward_failure: ${errors.join("; ")}`,
      message_size: messageSize,
    });
  }
}


