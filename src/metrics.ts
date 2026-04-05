export async function collectMetrics(db: D1Database): Promise<string> {
  const results = await db.batch([
    db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 AND forwarded < \"limit\" THEN 1 ELSE 0 END) as active, SUM(forwarded) as forwarded, SUM(rejected) as rejected, SUM(bytes_forwarded) as bytes_forwarded FROM aliases"),
    db.prepare("SELECT COUNT(DISTINCT user) as total FROM aliases"),
    db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END) as verified FROM recipients"),
    db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active FROM rules"),
    db.prepare("SELECT COUNT(*) as total FROM failed_deliveries"),
    db.prepare("SELECT COUNT(*) as total FROM failed_deliveries WHERE created_at > datetime('now', '-1 day')"),
    db.prepare("SELECT SUM(bandwidth_used) as total FROM user_settings"),
  ]);

  const aliases = results[0].results[0] as Record<string, number>;
  const users = results[1].results[0] as Record<string, number>;
  const recipients = results[2].results[0] as Record<string, number>;
  const rules = results[3].results[0] as Record<string, number>;
  const failures = results[4].results[0] as Record<string, number>;
  const failures24h = results[5].results[0] as Record<string, number>;
  const bandwidth = results[6].results[0] as Record<string, number>;

  const lines: string[] = [
    "# HELP email_aliases_total Total number of aliases",
    "# TYPE email_aliases_total gauge",
    `email_aliases_total ${aliases.total ?? 0}`,
    "",
    "# HELP email_aliases_active Number of active, non-expired aliases",
    "# TYPE email_aliases_active gauge",
    `email_aliases_active ${aliases.active ?? 0}`,
    "",
    "# HELP email_forwarded_total Total emails forwarded across all aliases",
    "# TYPE email_forwarded_total gauge",
    `email_forwarded_total ${aliases.forwarded ?? 0}`,
    "",
    "# HELP email_rejected_total Total emails rejected across all aliases",
    "# TYPE email_rejected_total gauge",
    `email_rejected_total ${aliases.rejected ?? 0}`,
    "",
    "# HELP email_bytes_forwarded_total Total bytes forwarded across all aliases",
    "# TYPE email_bytes_forwarded_total gauge",
    `email_bytes_forwarded_total ${aliases.bytes_forwarded ?? 0}`,
    "",
    "# HELP email_users_total Total distinct users",
    "# TYPE email_users_total gauge",
    `email_users_total ${users.total ?? 0}`,
    "",
    "# HELP email_recipients_total Total recipients",
    "# TYPE email_recipients_total gauge",
    `email_recipients_total{status="verified"} ${recipients.verified ?? 0}`,
    `email_recipients_total{status="pending"} ${(recipients.total ?? 0) - (recipients.verified ?? 0)}`,
    "",
    "# HELP email_rules_total Total rules",
    "# TYPE email_rules_total gauge",
    `email_rules_total{status="active"} ${rules.active ?? 0}`,
    `email_rules_total{status="inactive"} ${(rules.total ?? 0) - (rules.active ?? 0)}`,
    "",
    "# HELP email_failed_deliveries_total Total failed delivery records",
    "# TYPE email_failed_deliveries_total gauge",
    `email_failed_deliveries_total ${failures.total ?? 0}`,
    "",
    "# HELP email_failed_deliveries_24h Failed deliveries in the last 24 hours",
    "# TYPE email_failed_deliveries_24h gauge",
    `email_failed_deliveries_24h ${failures24h.total ?? 0}`,
    "",
    "# HELP email_bandwidth_used_bytes Total bandwidth used across all users",
    "# TYPE email_bandwidth_used_bytes gauge",
    `email_bandwidth_used_bytes ${bandwidth.total ?? 0}`,
    "",
  ];

  return lines.join("\n");
}
