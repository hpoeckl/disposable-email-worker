import type { FromNameFormat, SubjectFormat } from "./db/types";

export interface RewriteInput {
  sender: string;
  tag: string;
  forwarded: number;
  limit: number;
  format: FromNameFormat;
  subjectFormat: SubjectFormat;
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
  const { sender, tag, forwarded, limit, format, subjectFormat, noReplyAddress, whitelisted } = input;
  const counter = `[${forwarded}/${limit}]`;

  if (whitelisted) {
    return {
      from: `"${esc(sender)} via ${esc(tag)} (whitelisted)" <${noReplyAddress}>`,
      subject: null,
    };
  }

  let from: string | null;
  switch (format) {
    case "sender_count_alias":
      from = `"${esc(sender)} ${counter} via ${esc(tag)}" <${noReplyAddress}>`;
      break;

    case "sender_via_alias":
      from = `"${esc(sender)} via ${esc(tag)}" <${noReplyAddress}>`;
      break;

    case "tag_number_sender":
      from = `"${esc(tag)} ${counter} ${esc(sender)}" <${noReplyAddress}>`;
      break;

    case "alias_only":
      from = `"${esc(tag)}" <${noReplyAddress}>`;
      break;

    case "noreply":
      from = `<${noReplyAddress}>`;
      break;

    case "count_subject":
      // Legacy: treated as sender_via_alias — subject_format handles the prefix
      from = `"${esc(sender)} via ${esc(tag)}" <${noReplyAddress}>`;
      break;
  }

  let subject: string | null;
  switch (subjectFormat) {
    case "count_prefix":
      subject = `${counter} ${originalSubject}`;
      break;
    case "tag_count_prefix":
      subject = `${esc(tag)} ${counter} ${originalSubject}`;
      break;
    case "original":
    default:
      subject = null;
  }

  return { from, subject };
}

/** Escape double quotes in display name */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
