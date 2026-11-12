-- =============================================================================
-- REVERSÃO da migration 20261112120000_indicacoes_cancelamentos_troca_roteador.sql
--
-- ATENÇÃO: APAGA DEFINITIVAMENTE indicações, cancelamentos e motivos de troca de roteador.
-- Faça backup antes. Não afeta service_orders (exceto remover o gatilho do motivo),
-- clients, negociações, upgrades, profiles, user_roles nem auth.*.
-- Fica FORA de supabase/migrations para nunca ser aplicado automaticamente.
-- =============================================================================

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['referrals', 'cancellations', 'router_swaps'] LOOP
      IF EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_service_orders_router_swap_reason ON public.service_orders;
DROP FUNCTION IF EXISTS public.service_orders_require_router_swap_reason();
DROP TABLE IF EXISTS public.router_swaps;
DROP TABLE IF EXISTS public.cancellations;
DROP TABLE IF EXISTS public.referrals;
DROP TYPE IF EXISTS public.referral_status;
