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
  cf_destination_id: string | null;
  active: number;
  created_at: string;
}

export type WhitelistEntryType = "email" | "domain" | "segment";

export interface WhitelistEntry {
  id: number;
  alias_id: number;
  type: WhitelistEntryType;
  pattern: string;
}

export type RuleOperator = "and" | "or";
export type RuleAction = "forward" | "block" | "reject";
export type ConditionField = "sender" | "sender_domain" | "subject" | "alias_tag";
export type ConditionMatch = "equals" | "contains" | "starts_with" | "ends_with" | "regex";

export interface Rule {
  id: number;
  user: string;
  name: string;
  priority: number;
  operator: RuleOperator;
  action: RuleAction;
  forward_to: string | null;
  active: number;
  hit_count: number;
  created_at: string;
  last_hit_at: string | null;
}

export interface RuleCondition {
  id: number;
  rule_id: number;
  field: ConditionField;
  match: ConditionMatch;
  value: string;
}

export interface RuleWithConditions extends Rule {
  conditions: RuleCondition[];
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
