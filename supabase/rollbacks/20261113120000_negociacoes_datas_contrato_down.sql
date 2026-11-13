-- =============================================================================
-- REVERSÃO da migration 20261113120000_negociacoes_datas_contrato.sql
--
-- ATENÇÃO: apaga os valores de "Data de início do contrato" e "Data que ficou em
-- negociação" já informados. Faça backup antes.
-- Não afeta registered_on (data do cadastro), next_contact_on (próximo contato),
-- created_at, o histórico de contatos nem outras tabelas.
-- Fica FORA de supabase/migrations para nunca ser aplicado automaticamente.
-- =============================================================================

ALTER TABLE public.negotiations DROP COLUMN IF EXISTS negotiation_started_on;
ALTER TABLE public.negotiations DROP COLUMN IF EXISTS contract_started_on;
