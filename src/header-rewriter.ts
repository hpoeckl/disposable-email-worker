import type { FromNameFormat } from "./db/types";

export interface RewriteInput {
  sender: string;
  tag: string;
  forwarded: number;
  limit: number;
  format: FromNameFormat;
  noReplyAddress: string; // e.g. "noreply@drop.example.com"
  whitelisted?: boolean;
}

export interface RewriteResult {
  from: string | null; // null = don't rewrite From
  subject: string | null; // null = don't rewrite Subject
}

export function rewriteHeaders(
  input: RewriteInput,
  originalSubject: string,
): RewriteResult {
  const { sender, tag, forwarded, limit, format, noReplyAddress, whitelisted } = input;
  const counter = `[${forwarded}/${limit}]`;

  if (whitelisted) {
    return {
      from: `"${esc(sender)} via ${esc(tag)} (whitelisted)" <${noReplyAddress}>`,
      subject: null,
    };
  }

  switch (format) {
    case "sender_count_alias":
      return {
        from: `"${esc(sender)} ${counter} via ${esc(tag)}" <${noReplyAddress}>`,
        subject: null,
      };

    case "sender_via_alias":
      return {
        from: `"${esc(sender)} via ${esc(tag)}" <${noReplyAddress}>`,
        subject: null,
      };

    case "count_subject":
      return {
        from: `"${counter}" <${noReplyAddress}>`,
        subject: `${counter} ${originalSubject}`,
      };

    case "alias_only":
      return {
        from: `"${esc(tag)}" <${noReplyAddress}>`,
        subject: null,
      };

    case "noreply":
      return {
        from: `<${noReplyAddress}>`,
        subject: null,
      };
  }
}

/** Escape double quotes in display name */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
