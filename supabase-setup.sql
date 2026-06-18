-- ═══════════════════════════════════════════════════════
-- Supabase Setup SQL for ZoneClock
-- Run this in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. Enable auth (already enabled by default in Supabase)

-- 2. Create profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email              TEXT,
  is_premium         BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Row Level Security — users can only read their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Service role can update profiles"
  ON public.profiles FOR UPDATE
  USING (true);  -- Service key bypasses RLS

-- 5. Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 6. Make yourself premium (replace with your email)
-- UPDATE public.profiles SET is_premium = TRUE
-- WHERE email = 'your@email.com';
