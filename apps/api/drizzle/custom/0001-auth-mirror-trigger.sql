-- ---------------------------------------------------------------------------
-- Auto-mirror auth.users → public.users on signup.
--
-- Supabase GoTrue inserta en auth.users al hacer signup. Esta función crea
-- automáticamente la fila correspondiente en public.users con valores default.
--
-- Aplicar DESPUÉS de las migraciones de drizzle, una vez que public.users existe.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, username, discord_id, role)
  VALUES (
    NEW.id,
    -- Preferimos: raw_user_meta_data.username → email prefix → uuid stringificado
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1),
      NEW.id::text
    ),
    -- Si el OAuth provider es discord, guardar el provider id
    CASE
      WHEN NEW.raw_app_meta_data->>'provider' = 'discord'
        THEN NEW.raw_user_meta_data->>'provider_id'
      ELSE NULL
    END,
    'player'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
