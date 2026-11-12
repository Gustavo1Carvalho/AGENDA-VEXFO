-- =============================================================================
-- Agenda VEXFO Fibra — INDICAÇÕES, CANCELAMENTOS e MOTIVO DA TROCA DE ROTEADOR
-- Versão: 20261112120000  (depende de 20261111120000_modulos_negociacoes_upgrades)
--
-- ATENÇÃO: NÃO aplicar em produção sem autorização explícita do responsável.
--
-- Somente ADIÇÕES:
--   * enum   public.referral_status ('contratou', 'nao_contratou')
--   * tabela public.referrals      (indicações; cliente indicador = public.clients)
--   * tabela public.cancellations  (registro interno de cancelamentos; não cancela nada no provedor)
--   * tabela public.router_swaps   (motivo da troca de roteador, 1 por ordem de serviço)
--   * gatilho em service_orders: técnico não finaliza OS "troca_roteador" sem motivo registrado
--     (OS de outros tipos e alterações feitas por administradores não são afetadas)
--   * RLS: indicações/cancelamentos só para administradores (sem exclusão, preserva histórico);
--          trocas: administradores + o técnico responsável pela OS.
--   * Realtime nas novas tabelas.
--
-- Não altera colunas, dados nem políticas existentes. Idempotente.
-- Reversão: supabase/rollbacks/20261112120000_indicacoes_cancelamentos_troca_roteador_down.sql
-- =============================================================================

-- 1. Indicações -----------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE public.referral_status AS ENUM ('contratou', 'nao_contratou');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.referrals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  agent_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_name       text NOT NULL CHECK (length(btrim(referred_name)) > 0),
  referred_phone      text NOT NULL CHECK (length(btrim(referred_phone)) > 0),
  referred_on         date NOT NULL DEFAULT current_date,
  status              public.referral_status NOT NULL DEFAULT 'nao_contratou',
  contracted_plan     text,
  new_contract_number text,
  contracted_on       date,
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Quando contratou: plano, número do novo contrato e data da contratação são obrigatórios.
  CONSTRAINT referrals_contracted_fields CHECK (
    status <> 'contratou' OR (
      length(btrim(coalesce(contracted_plan, ''))) > 0
      AND length(btrim(coalesce(new_contract_number, ''))) > 0
      AND contracted_on IS NOT NULL
    )
  )
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_client_id);
CREATE INDEX IF NOT EXISTS referrals_agent_idx    ON public.referrals (agent_id);
CREATE INDEX IF NOT EXISTS referrals_date_idx     ON public.referrals (referred_on);
CREATE INDEX IF NOT EXISTS referrals_status_idx   ON public.referrals (status);

-- 2. Cancelamentos (controle interno) ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.cancellations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  current_plan  text,
  cancelled_on  date NOT NULL DEFAULT current_date,
  agent_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Texto livre no banco: as opções ("Insatisfação", "Cliente mudou de endereço") ficam no app,
  -- permitindo incluir novos motivos no futuro sem nova migration.
  reason        text NOT NULL CHECK (length(btrim(reason)) > 0),
  notes         text,
  created_by    uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cancellations_client_idx ON public.cancellations (client_id);
CREATE INDEX IF NOT EXISTS cancellations_agent_idx  ON public.cancellations (agent_id);
CREATE INDEX IF NOT EXISTS cancellations_date_idx   ON public.cancellations (cancelled_on);
CREATE INDEX IF NOT EXISTS cancellations_reason_idx ON public.cancellations (lower(reason));

-- 3. Motivo da troca de roteador --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.router_swaps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE CASCADE,
  reason           text NOT NULL CHECK (reason IN (
                     'equipamento_defeito', 'roteador_queimado', 'problema_wifi',
                     'funcionamento_inadequado', 'upgrade_equipamento', 'outro')),
  reason_other     text,
  notes            text,
  contract_number  text,
  technician_id    uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- "Outro motivo" exige a explicação.
  CONSTRAINT router_swaps_other_reason CHECK (reason <> 'outro' OR length(btrim(coalesce(reason_other, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS router_swaps_technician_idx ON public.router_swaps (technician_id);
CREATE INDEX IF NOT EXISTS router_swaps_reason_idx     ON public.router_swaps (reason);

-- 4. updated_at -----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_referrals_updated ON public.referrals;
CREATE TRIGGER trg_referrals_updated BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_cancellations_updated ON public.cancellations;
CREATE TRIGGER trg_cancellations_updated BEFORE UPDATE ON public.cancellations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_router_swaps_updated ON public.router_swaps;
CREATE TRIGGER trg_router_swaps_updated BEFORE UPDATE ON public.router_swaps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Técnico não finaliza OS de troca de roteador sem o motivo --------------------
-- Só vale para usuários logados que não são administradores, e só na transição para "finalizado".
CREATE OR REPLACE FUNCTION public.service_orders_require_router_swap_reason()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'finalizado'
     AND OLD.status IS DISTINCT FROM 'finalizado'
     AND NEW.service_type = 'troca_roteador'
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT EXISTS (SELECT 1 FROM public.router_swaps rs WHERE rs.service_order_id = NEW.id)
  THEN
    RAISE EXCEPTION 'Informe o motivo da troca do roteador antes de finalizar a ordem de serviço.'
      USING ERRCODE = 'P0001', HINT = 'router_swap_reason_required';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_service_orders_router_swap_reason ON public.service_orders;
CREATE TRIGGER trg_service_orders_router_swap_reason BEFORE UPDATE OF status ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.service_orders_require_router_swap_reason();

REVOKE EXECUTE ON FUNCTION public.service_orders_require_router_swap_reason() FROM PUBLIC, anon, authenticated;

-- 6. RLS ----------------------------------------------------------------------------
ALTER TABLE public.referrals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.router_swaps  ENABLE ROW LEVEL SECURITY;

-- Indicações e cancelamentos: administradores consultam, cadastram e editam (sem exclusão).
DROP POLICY IF EXISTS "Admins view referrals" ON public.referrals;
CREATE POLICY "Admins view referrals" ON public.referrals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins insert referrals" ON public.referrals;
CREATE POLICY "Admins insert referrals" ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update referrals" ON public.referrals;
CREATE POLICY "Admins update referrals" ON public.referrals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view cancellations" ON public.cancellations;
CREATE POLICY "Admins view cancellations" ON public.cancellations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins insert cancellations" ON public.cancellations;
CREATE POLICY "Admins insert cancellations" ON public.cancellations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update cancellations" ON public.cancellations;
CREATE POLICY "Admins update cancellations" ON public.cancellations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trocas: administradores (consulta/edição) e o técnico da OS (consulta, registro e correção).
DROP POLICY IF EXISTS "Admins view router swaps" ON public.router_swaps;
CREATE POLICY "Admins view router swaps" ON public.router_swaps FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins insert router swaps" ON public.router_swaps;
CREATE POLICY "Admins insert router swaps" ON public.router_swaps FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update router swaps" ON public.router_swaps;
CREATE POLICY "Admins update router swaps" ON public.router_swaps FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Technicians view own router swaps" ON public.router_swaps;
CREATE POLICY "Technicians view own router swaps" ON public.router_swaps FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'tecnico')
    AND EXISTS (SELECT 1 FROM public.service_orders so
                WHERE so.id = router_swaps.service_order_id AND so.technician_id = auth.uid())
  );
DROP POLICY IF EXISTS "Technicians insert own router swaps" ON public.router_swaps;
CREATE POLICY "Technicians insert own router swaps" ON public.router_swaps FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'tecnico')
    AND EXISTS (SELECT 1 FROM public.service_orders so
                WHERE so.id = router_swaps.service_order_id AND so.technician_id = auth.uid()
                  AND so.service_type = 'troca_roteador')
  );
DROP POLICY IF EXISTS "Technicians update own router swaps" ON public.router_swaps;
CREATE POLICY "Technicians update own router swaps" ON public.router_swaps FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'tecnico')
    AND EXISTS (SELECT 1 FROM public.service_orders so
                WHERE so.id = router_swaps.service_order_id AND so.technician_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'tecnico')
    AND EXISTS (SELECT 1 FROM public.service_orders so
                WHERE so.id = router_swaps.service_order_id AND so.technician_id = auth.uid()
                  AND so.service_type = 'troca_roteador')
  );

-- 7. Realtime -------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['referrals', 'cancellations', 'router_swaps'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
