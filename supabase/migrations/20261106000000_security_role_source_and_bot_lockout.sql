-- Role must come only from public.profiles: JWT user_metadata is writable by the user
-- via supabase.auth.updateUser(), so trusting it allowed self-promotion to admin.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- The system bot never signs in: replace its previously committed password and ban logins.
UPDATE auth.users
SET encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf')),
    banned_until = 'infinity',
    updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000001';

DELETE FROM auth.refresh_tokens
WHERE user_id = '00000000-0000-0000-0000-000000000001';
