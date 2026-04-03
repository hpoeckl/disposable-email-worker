export type FromNameFormat =
  | "sender_count_alias"
  | "sender_via_alias"
  | "count_subject"
  | "alias_only"
  | "noreply";

export interface UserSettings {
  user: string;
  catch_all: number;
  from_name_format: FromNameFormat;
  default_limit: number;
  bandwidth_limit: number;
  bandwidth_used: number;
  bandwidth_reset_at: string;
}

export interface Alias {
  id: number;
  user: string;
  tag: string;
  description: string | null;
  limit: number;
  forwarded: number;
  rejected: number;
  bytes_forwarded: number;
  active: number;
  created_at: string;
  last_forwarded_at: string | null;
  last_rejected_at: string | null;
}

export interface Recipient {
  id: number;
  user: string;
  email: string;
  verified_at: string | null;
  created_at: string;
}

export interface FailedDelivery {
  id: number;
  user: string;
  alias_tag: string | null;
  sender: string | null;
  subject: string | null;
  reason: string;
  message_size: number | null;
  created_at: string;
}
