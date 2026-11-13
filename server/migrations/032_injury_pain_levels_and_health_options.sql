BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS injury_pain_levels JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS injuries TEXT[],
  ADD COLUMN IF NOT EXISTS health_conditions TEXT[];

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'users'
      AND column_name = 'injuries'
      AND data_type = 'text'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE users
      ALTER COLUMN injuries TYPE TEXT[] USING
        CASE
          WHEN injuries IS NULL OR BTRIM(injuries) = '' THEN ARRAY[]::TEXT[]
          ELSE injuries::TEXT[]
        END
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'users'
      AND column_name = 'health_conditions'
      AND data_type = 'text'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE users
      ALTER COLUMN health_conditions TYPE TEXT[] USING
        CASE
          WHEN health_conditions IS NULL OR BTRIM(health_conditions) = '' THEN ARRAY[]::TEXT[]
          ELSE health_conditions::TEXT[]
        END
    $sql$;
  END IF;
END $$;

UPDATE users
SET health_conditions = array_replace(
  array_replace(health_conditions, 'High Blood Pressure', 'Hypertension'),
  'Heart Condition',
  'Heart Disease'
)
WHERE health_conditions && ARRAY['High Blood Pressure', 'Heart Condition']::text[];

COMMIT;
