-- =============================================================================
-- Agenda VEXFO Fibra — Módulos comerciais: NEGOCIAÇÕES e UPGRADES
-- Versão: 20261111120000
--
-- ATENÇÃO: NÃO aplicar em produção sem autorização explícita do responsável.
--
-- O que esta migration faz (somente ADIÇÕES — nada existente é alterado/apagado):
--   * enum   public.negotiation_status
--   * tabela public.clients               (cadastro único de clientes comerciais)
--   * tabela public.negotiations          (clientes em negociação / bloqueados)
--   * tabela public.negotiation_contacts  (histórico de contatos e observações)
--   * tabela public.plan_upgrades         (upgrades de plano; diferença calculada no banco)
--   * RLS: acesso total apenas para administradores (public.has_role(..., 'admin'));
--          técnicos e anônimos não têm acesso.
--   * Realtime habilitado nas novas tabelas (sincronização entre usuários).
--
-- Não toca em: service_orders, profiles, user_roles, user_presence, auth.*.
-- É idempotente (pode ser executada novamente sem erro).
-- Reversão: supabase/rollbacks/20261111120000_modulos_negociacoes_upgrades_down.sql
-- =============================================================================

-- 1. Enum de situação ---------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE public.negotiation_status AS ENUM ('em_negociacao', 'bloqueado', 'convertido');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Clientes -----------------------------------------------------------------
-- Não existia cadastro de clientes no sistema (as OS guardam os dados do cliente
-- diretamente em service_orders). Esta tabela é compartilhada pelos módulos
-- Negociações e Upgrades para evitar duplicidade: código e CPF são únicos.
CREATE TABLE IF NOT EXISTS public.clients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (length(btrim(name)) > 0),
  client_code  text CHECK (client_code IS NULL OR length(btrim(client_code)) > 0),
  cpf          text CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  phone        text,
  address      text,
  neighborhood text,
  created_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clients_client_code_unique ON public.clients (lower(btrim(client_code)))
  WHERE client_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clients_cpf_unique ON public.clients (cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_name_idx ON public.clients (lower(name));

-- 3. Negociações --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.negotiations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  current_plan    text,
  interested_plan text,
  status          public.negotiation_status NOT NULL DEFAULT 'em_negociacao',
  reason          text NOT NULL CHECK (length(btrim(reason)) > 0),
  responsible_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  registered_on   date NOT NULL DEFAULT current_date,
  next_contact_on date,
  notes           text,
  converted_at    timestamptz,
  created_by      uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS negotiations_client_idx       ON public.negotiations (client_id);
CREATE INDEX IF NOT EXISTS negotiations_status_idx       ON public.negotiations (status);
CREATE INDEX IF NOT EXISTS negotiations_responsible_idx  ON public.negotiations (responsible_id);
CREATE INDEX IF NOT EXISTS negotiations_registered_idx   ON public.negotiations (registered_on);
CREATE INDEX IF NOT EXISTS negotiations_next_contact_idx ON public.negotiations (next_contact_on);

-- 4. Histórico de contatos ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.negotiation_contacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id uuid NOT NULL REFERENCES public.negotiations(id) ON DELETE CASCADE,
  contact_type   text NOT NULL DEFAULT 'observacao'
                 CHECK (contact_type IN ('telefone', 'whatsapp', 'presencial', 'email', 'observacao', 'situacao')),
  description    text NOT NULL CHECK (length(btrim(description)) > 0),
  contacted_at   timestamptz NOT NULL DEFAULT now(),
  created_by     uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS negotiation_contacts_negotiation_idx
  ON public.negotiation_contacts (negotiation_id, contacted_at DESC);

-- 5. Upgrades de plano ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_upgrades (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  previous_plan      text NOT NULL CHECK (length(btrim(previous_plan)) > 0),
  new_plan           text NOT NULL CHECK (length(btrim(new_plan)) > 0),
  previous_value     numeric(10, 2) NOT NULL CHECK (previous_value >= 0),
  new_value          numeric(10, 2) NOT NULL CHECK (new_value >= 0),
  -- Diferença de mensalidade calculada pelo próprio banco (sempre consistente).
  monthly_difference numeric(10, 2) GENERATED ALWAYS AS (new_value - previous_value) STORED,
  upgrade_date       date NOT NULL DEFAULT current_date,
  responsible_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes              text,
  created_by         uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_upgrades_client_idx      ON public.plan_upgrades (client_id);
CREATE INDEX IF NOT EXISTS plan_upgrades_date_idx        ON public.plan_upgrades (upgrade_date);
CREATE INDEX IF NOT EXISTS plan_upgrades_responsible_idx ON public.plan_upgrades (responsible_id);
CREATE INDEX IF NOT EXISTS plan_upgrades_new_plan_idx    ON public.plan_upgrades (lower(new_plan));

-- 6. Triggers -----------------------------------------------------------------
-- updated_at (reutiliza a função existente public.set_updated_at)
DROP TRIGGER IF EXISTS trg_clients_updated ON public.clients;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_negotiations_updated ON public.negotiations;
CREATE TRIGGER trg_negotiations_updated BEFORE UPDATE ON public.negotiations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_plan_upgrades_updated ON public.plan_upgrades;
CREATE TRIGGER trg_plan_upgrades_updated BEFORE UPDATE ON public.plan_upgrades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- converted_at acompanha a situação "convertido" (negociação convertida em contratação)
CREATE OR REPLACE FUNCTION public.negotiations_sync_converted_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'convertido' THEN
    NEW.converted_at := COALESCE(NEW.converted_at, now());
  ELSE
    NEW.converted_at := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_negotiations_converted ON public.negotiations;
CREATE TRIGGER trg_negotiations_converted BEFORE INSERT OR UPDATE OF status, converted_at ON public.negotiations
  FOR EACH ROW EXECUTE FUNCTION public.negotiations_sync_converted_at();

-- Registra automaticamente no histórico toda mudança de situação.
-- SECURITY INVOKER: respeita a RLS de quem fez a alteração (apenas administradores).
CREATE OR REPLACE FUNCTION public.negotiations_log_status_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  old_label text;
  new_label text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    old_label := CASE OLD.status WHEN 'em_negociacao' THEN 'Em negociação'
                                 WHEN 'bloqueado' THEN 'Bloqueado'
                                 ELSE 'Convertido em contratação' END;
    new_label := CASE NEW.status WHEN 'em_negociacao' THEN 'Em negociação'
                                 WHEN 'bloqueado' THEN 'Bloqueado'
                                 ELSE 'Convertido em contratação' END;
    INSERT INTO public.negotiation_contacts (negotiation_id, contact_type, description)
    VALUES (NEW.id, 'situacao', format('Situação alterada de "%s" para "%s".', old_label, new_label));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_negotiations_status_log ON public.negotiations;
CREATE TRIGGER trg_negotiations_status_log AFTER UPDATE OF status ON public.negotiations
  FOR EACH ROW EXECUTE FUNCTION public.negotiations_log_status_change();

REVOKE EXECUTE ON FUNCTION public.negotiations_sync_converted_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.negotiations_log_status_change() FROM PUBLIC, anon, authenticated;

-- 7. Row Level Security --------------------------------------------------------
ALTER TABLE public.clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiation_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_upgrades        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage clients" ON public.clients;
CREATE POLICY "Admins manage clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage negotiations" ON public.negotiations;
CREATE POLICY "Admins manage negotiations" ON public.negotiations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage negotiation contacts" ON public.negotiation_contacts;
CREATE POLICY "Admins manage negotiation contacts" ON public.negotiation_contacts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage plan upgrades" ON public.plan_upgrades;
CREATE POLICY "Admins manage plan upgrades" ON public.plan_upgrades FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. Realtime (sincronização entre usuários) -----------------------------------
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['clients', 'negotiations', 'negotiation_contacts', 'plan_upgrades'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
