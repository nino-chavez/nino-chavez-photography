-- Add jersey_number column to photo_metadata table
-- Part of Initiative 2.2: Closing the Data Gaps (Next-Gen CV)

-- Add jersey_number column (nullable integer)
ALTER TABLE photo_metadata
ADD COLUMN IF NOT EXISTS jersey_number INTEGER;

-- Create index for jersey number searches
CREATE INDEX IF NOT EXISTS idx_photo_metadata_jersey_number
ON photo_metadata(jersey_number)
WHERE jersey_number IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN photo_metadata.jersey_number IS
'Player jersey number extracted from photo via AI vision. NULL if not visible/applicable.';

-- Verify the change
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'photo_metadata'
  AND column_name = 'jersey_number';
