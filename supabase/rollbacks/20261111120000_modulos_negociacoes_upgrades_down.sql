-- =============================================================================
-- REVERSÃO da migration 20261111120000_modulos_negociacoes_upgrades.sql
--
-- ATENÇÃO: APAGA DEFINITIVAMENTE todos os dados de Negociações, Upgrades,
-- histórico de contatos e clientes comerciais. Faça backup antes.
-- Não afeta service_orders, profiles, user_roles, user_presence nem auth.*.
-- Este arquivo fica FORA de supabase/migrations de propósito, para nunca ser
-- aplicado automaticamente.
-- =============================================================================

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['clients', 'negotiations', 'negotiation_contacts', 'plan_upgrades'] LOOP
      IF EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

DROP TABLE IF EXISTS public.negotiation_contacts;
DROP TABLE IF EXISTS public.plan_upgrades;
DROP TABLE IF EXISTS public.negotiations;
DROP TABLE IF EXISTS public.clients;
DROP FUNCTION IF EXISTS public.negotiations_log_status_change();
DROP FUNCTION IF EXISTS public.negotiations_sync_converted_at();
DROP TYPE IF EXISTS public.negotiation_status;
