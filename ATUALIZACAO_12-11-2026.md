# Agenda VEXFO Fibra — Atualização 12/11/2026

Novos recursos: **Indicações**, **Cancelamentos** e **Motivo da troca de roteador** nas ordens de serviço.
Os módulos e fluxos existentes continuam funcionando como antes.

## ⚠️ Ordem de implantação (importante)

1. **Publique primeiro o site** (Netlify). A nova versão funciona mesmo antes da migration:
   - Indicações e Cancelamentos mostram o aviso "tabelas ainda não criadas";
   - o técnico continua finalizando OS de troca do jeito antigo, até a migration existir.
2. **Depois aplique a migration** no SQL Editor do Supabase/Lovable Cloud (faça backup antes):
   `supabase/migrations/20261112120000_indicacoes_cancelamentos_troca_roteador.sql`

Não inverta a ordem: com a migration aplicada e o site antigo no ar, o banco passa a exigir o motivo da troca,
mas a tela antiga do técnico não tem onde informá-lo.

A migration depende da `20261111120000_modulos_negociacoes_upgrades.sql`, que já está aplicada em produção.
Ela só adiciona estruturas e pode ser executada mais de uma vez.
Reversão: `supabase/rollbacks/20261112120000_indicacoes_cancelamentos_troca_roteador_down.sql`.

### O que o banco ganha

| Estrutura | Conteúdo |
|---|---|
| `referrals` | Indicações. Cliente indicador = cadastro único `clients` (contrato em `client_code`). Status **somente** `contratou` / `nao_contratou`. "Contratou" exige plano, número do novo contrato e data da contratação (regra no banco). |
| `cancellations` | Registro **interno** de cancelamentos. Não cancela nada no provedor, não bloqueia conexão e não altera contratos. |
| `router_swaps` | Motivo da troca de roteador, 1 registro por OS: motivo, explicação ("Outro motivo"), observações e número do contrato. |
| Gatilho em `service_orders` | Técnico **não consegue finalizar** OS do tipo *Troca de Roteador* sem o motivo registrado. Não afeta OS de outros tipos, OS já finalizadas nem alterações feitas por administradores. |

**Permissões (RLS)**
- Indicações e cancelamentos: só administradores consultam, cadastram e editam. Não há exclusão, para preservar o histórico.
- Motivo da troca: administradores e o técnico responsável pela OS.

As três tabelas estão no Realtime.

## Funcionalidades

**Indicações** (menu → Indicações)
- **Cliente que indicou:** localizado na base de clientes, com nome e contrato preenchidos automaticamente e sem duplicar o cadastro.
- **Novo cliente:** nome, telefone e data da indicação.
- **Status:** somente *Contratou* ou *Não contratou*. "Contratou" mostra e exige plano, número do novo contrato e data da contratação.
- **Mudança de status:** atualiza o mesmo registro. Os dados de contratação já informados ficam guardados.
- **Painel:** indicações no mês, contrataram, não contrataram, taxa de conversão, indicações por agente, histórico mensal e planos contratados.
- **Filtros:** mês, ano e agente, além de pesquisa e status na listagem.
- **PDF:** resumo com total, conversões e taxa de conversão, e o detalhamento das indicações.

**Cancelamentos** (menu → Cancelamentos)
- **Registro:** cliente localizado na base, com o plano atual sugerido pelo último upgrade ou negociação. Data, agente, motivo (*Insatisfação* ou *Cliente mudou de endereço*) e observações.
- **Painel:** total no mês, quantidade por motivo, quantidade por agente, histórico mensal e comparativo entre os motivos.
- **Filtros:** mês, ano, agente e motivo.
- **PDF:** resumo por motivo e por agente, e o detalhamento com as observações.

**Motivo da troca de roteador** (técnico → Meus Atendimentos)
- Só em OS de *Troca de Roteador*. O botão "Finalizar" abre o formulário com o seletor obrigatório de 6 motivos.
- "Outro motivo" libera a explicação, que passa a ser obrigatória. Há também campo de observações e de número do contrato (opcional).
- O técnico pode registrar o motivo antes, pelo botão "Motivo da troca", e o motivo aparece no cartão da OS.
- **Administrador, no detalhe da OS:** cliente, número do contrato, técnico, data da troca, motivo e observações, com edição.
- **Relatórios → aba "Trocas de roteador":** filtros por período, técnico e motivo (inclusive "sem motivo registrado", para OS antigas) e PDF.

## Rodar localmente

```bash
npm install
npm run dev
```

## Publicar na Netlify

Build `npm run build`, pasta `dist` (já configurados em `netlify.toml`), variáveis `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY`. Depois de publicar, aplique a migration (seção acima).
