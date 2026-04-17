-- Migration: 0005_subject_format
-- Description: Add subject_format column; migrate count_subject users to sender_via_alias + count_prefix

ALTER TABLE user_settings ADD COLUMN subject_format TEXT NOT NULL DEFAULT 'original';

-- Migrate existing users who had count_subject: preserve the [n/m] subject prefix
-- and use sender_via_alias for the From header (which is what count_subject did).
UPDATE user_settings
SET from_name_format = 'sender_via_alias', subject_format = 'count_prefix'
WHERE from_name_format = 'count_subject';
