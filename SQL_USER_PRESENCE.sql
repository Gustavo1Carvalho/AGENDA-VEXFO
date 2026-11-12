-- Execute este SQL no backend do Lovable Cloud/Supabase para ativar status online/offline.

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view presence" ON public.user_presence;
DROP POLICY IF EXISTS "Users update own presence" ON public.user_presence;
DROP POLICY IF EXISTS "Admins view all presence" ON public.user_presence;

CREATE POLICY "Users can view presence"
ON public.user_presence
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Users update own presence"
ON public.user_presence
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own presence updates"
ON public.user_presence
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen_at ON public.user_presence(last_seen_at DESC);

-- Opcional, se ainda não existir permissão de admin para editar todas as OS:
DROP POLICY IF EXISTS "Admins update all service orders" ON public.service_orders;
CREATE POLICY "Admins update all service orders"
ON public.service_orders
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
