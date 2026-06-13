-- Migration: 002_normalize_progressive_category
-- Purpose:
--   Keep the inventory category seed value consistent with the current code/schema,
--   which now uses "PROGRESSIVE" instead of "Progressive".
--
-- Production safety:
--   - Does not drop tables.
--   - Does not delete data.
--   - Handles both common case-insensitive MySQL collations and rare duplicate
--     case-sensitive category rows.
--   - Re-points existing items to the canonical row if duplicate category rows exist.

START TRANSACTION;

-- Capture any existing legacy/canonical category rows.
SET @legacy_progressive_category_id := (
  SELECT id
  FROM item_categories
  WHERE BINARY name = 'Progressive'
  ORDER BY id
  LIMIT 1
);

SET @canonical_progressive_category_id := (
  SELECT id
  FROM item_categories
  WHERE BINARY name = 'PROGRESSIVE'
  ORDER BY id
  LIMIT 1
);

-- If neither spelling exists, create the canonical category.
INSERT INTO item_categories (name, is_active, deleted_at)
SELECT 'PROGRESSIVE', 1, NULL
WHERE @legacy_progressive_category_id IS NULL
  AND @canonical_progressive_category_id IS NULL;

-- Refresh ids after the optional insert.
SET @legacy_progressive_category_id := (
  SELECT id
  FROM item_categories
  WHERE BINARY name = 'Progressive'
  ORDER BY id
  LIMIT 1
);

SET @canonical_progressive_category_id := (
  SELECT id
  FROM item_categories
  WHERE BINARY name = 'PROGRESSIVE'
  ORDER BY id
  LIMIT 1
);

-- Common case: only the legacy row exists. Rename it in place and keep it active.
UPDATE item_categories
SET name = 'PROGRESSIVE',
    is_active = 1,
    deleted_at = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id = @legacy_progressive_category_id
  AND @canonical_progressive_category_id IS NULL;

-- Refresh canonical id after a possible in-place rename.
SET @canonical_progressive_category_id := (
  SELECT id
  FROM item_categories
  WHERE BINARY name = 'PROGRESSIVE'
  ORDER BY id
  LIMIT 1
);

-- Rare case: both rows exist under a case-sensitive collation.
-- Move linked items to the canonical row, then soft-disable the duplicate legacy row.
UPDATE items
SET category_id = @canonical_progressive_category_id,
    updated_at = CURRENT_TIMESTAMP
WHERE category_id = @legacy_progressive_category_id
  AND @legacy_progressive_category_id IS NOT NULL
  AND @canonical_progressive_category_id IS NOT NULL
  AND @legacy_progressive_category_id <> @canonical_progressive_category_id;

UPDATE item_categories
SET is_active = 0,
    deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
WHERE id = @legacy_progressive_category_id
  AND @legacy_progressive_category_id IS NOT NULL
  AND @canonical_progressive_category_id IS NOT NULL
  AND @legacy_progressive_category_id <> @canonical_progressive_category_id;

-- Ensure the canonical category remains active for new and existing inventory items.
UPDATE item_categories
SET is_active = 1,
    deleted_at = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id = @canonical_progressive_category_id;

COMMIT;
