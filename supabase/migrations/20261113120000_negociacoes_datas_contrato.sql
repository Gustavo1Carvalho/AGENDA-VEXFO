-- =============================================================================
-- Agenda VEXFO Fibra — NEGOCIAÇÕES: data de início do contrato e data em que
-- o cliente ficou em negociação.
-- Versão: 20261113120000  (depende de 20261111120000_modulos_negociacoes_upgrades)
--
-- ATENÇÃO: NÃO aplicar em produção sem autorização explícita do responsável.
--
-- Somente ADIÇÕES (colunas opcionais). Nada é apagado ou reaproveitado:
--   * contract_started_on    — data em que o contrato do cliente começou na VEXFO
--                              (obrigatória no formulário; registros antigos ficam sem valor).
--   * negotiation_started_on — data em que o cliente entrou em situação de negociação.
--
-- Continuam como estão (sem cópia de valores entre colunas):
--   * registered_on   — data do cadastro, armazenada internamente (ordenação, filtros, auditoria).
--   * next_contact_on — próximo contato, controlado pelo histórico de contatos ("Registrar contato").
--   * created_at      — registro real de criação.
--
-- RLS: as políticas existentes valem para a tabela inteira; nenhuma política é alterada.
-- Idempotente. Reversão: supabase/rollbacks/20261113120000_negociacoes_datas_contrato_down.sql
-- =============================================================================

ALTER TABLE public.negotiations ADD COLUMN IF NOT EXISTS contract_started_on date;
ALTER TABLE public.negotiations ADD COLUMN IF NOT EXISTS negotiation_started_on date;

COMMENT ON COLUMN public.negotiations.contract_started_on IS
  'Data de início do contrato do cliente na VEXFO (informada no formulário de Negociações).';
COMMENT ON COLUMN public.negotiations.negotiation_started_on IS
  'Data em que o cliente ficou em negociação. Não é agendamento de contato (ver next_contact_on).';
