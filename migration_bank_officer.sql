-- ============================================================
-- MIGRATION: Add Bank Officer Role Support
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================


-- STEP 1: Remove the old CHECK constraint on profiles.role
--         (This is what causes "Database error creating new user")

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find any CHECK constraint on the role column
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'profiles'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%role%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  ELSE
    RAISE NOTICE 'No CHECK constraint found on profiles.role — skipping';
  END IF;
END $$;


-- STEP 2: Migrate existing 'officer' users → 'agrivalidator_officer'
--         (Must happen BEFORE adding the new constraint)

UPDATE public.profiles
SET role = 'agrivalidator_officer'
WHERE role = 'officer';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "agrivalidator_officer"}'::jsonb
WHERE raw_user_meta_data->>'role' = 'officer';


-- STEP 3: Add new CHECK constraint allowing all 3 roles

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('farmer', 'agrivalidator_officer', 'bank_officer'));


-- STEP 4: Recreate the profiles trigger for new user registration

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'farmer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- DONE! The system now supports 3 roles:
--   farmer                → /farmer/dashboard
--   agrivalidator_officer  → /officer/dashboard
--   bank_officer           → /bank/dashboard
-- ============================================================
