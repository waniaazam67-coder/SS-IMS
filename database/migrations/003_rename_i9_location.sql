-- Migration: 003_rename_i9_location
-- Purpose:
--   Rename the IMS warehouse display/code from "I9" to "I-9" without deleting data.
--
-- Production safety:
--   - Does not drop tables.
--   - Does not delete data.
--   - Updates the existing location row in place so linked inventory balances,
--     stock movements, requests, POs, and GRNs keep their foreign-key references.

START TRANSACTION;

UPDATE locations
SET code = 'I-9',
    name = 'I-9 warehouse',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'I9 warehouse'
   OR code = 'I9';

COMMIT;
