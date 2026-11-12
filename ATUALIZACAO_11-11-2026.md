# Agenda VEXFO Fibra — Atualização 11/11/2026 (Comercial)

Novos módulos **Negociações** e **Upgrades**, integrados aos **Relatórios**.
Ordens de serviço, login e permissões existentes não foram alterados.

## ⚠️ Antes de publicar: aplicar a migration do banco

As telas novas dependem de 4 tabelas novas. Enquanto a migration não for aplicada, as telas
Negociações/Upgrades mostram o aviso "As tabelas dos módulos comerciais ainda não foram criadas no banco",
e o restante do sistema funciona normalmente.

1. Faça um backup do banco (Lovable Cloud → Cloud → Database, ou Supabase → Database → Backups).
2. Abra o **SQL Editor** do projeto e execute o conteúdo de
   `supabase/migrations/20261111120000_modulos_negociacoes_upgrades.sql`.
3. Confira em *Table Editor* se existem `clients`, `negotiations`, `negotiation_contacts` e `plan_upgrades`.

A migration só **adiciona** estruturas (não altera nem apaga dados existentes) e pode ser executada mais de uma vez.
Para desfazer: `supabase/rollbacks/20261111120000_modulos_negociacoes_upgrades_down.sql`
(apaga os dados comerciais; fica fora da pasta de migrations para nunca rodar sozinho).

### O que o banco ganha

| Tabela | Conteúdo |
|---|---|
| `clients` | Cadastro único de clientes comerciais. Código e CPF são únicos (sem duplicidade). |
| `negotiations` | Negociações/bloqueios: planos, situação, motivo, responsável, datas, observações. |
| `negotiation_contacts` | Histórico de contatos. Mudanças de situação são registradas automaticamente. |
| `plan_upgrades` | Upgrades. A **diferença de mensalidade é calculada pelo próprio banco** (`novo valor − valor anterior`). |

- **Permissões (RLS):** somente usuários com papel `admin` leem e gravam. Técnicos e visitantes não têm acesso.
- **Realtime:** as 4 tabelas estão na publicação `supabase_realtime`, então as alterações aparecem para os outros usuários sem recarregar a página.
- **Situação "Convertido em contratação":** usada nos relatórios de conversão. A data da conversão é preenchida automaticamente.

## Funcionalidades

**Negociações** (menu lateral → Negociações)
- Cadastrar, editar e excluir (com confirmação). Também é possível alterar a situação: Em negociação, Bloqueado ou Convertido em contratação.
- Motivos sugeridos, ou "Outros" com texto livre.
- Pesquisa por nome, telefone, código ou CPF. Filtros por situação, responsável, período do cadastro e contatos pendentes.
- Detalhes do cliente com histórico de contatos (ligação, WhatsApp, presencial, e-mail, observação) e agendamento do próximo contato.
- Contatos atrasados ficam destacados em vermelho e aparecem no topo da lista.
- Indicadores: Total em negociação, Total de bloqueados, Aguardando retorno e Contatos pendentes. Clicar em um indicador aplica o filtro correspondente.

**Upgrades** (menu lateral → Upgrades)
- Registrar, editar e excluir (com confirmação). A diferença é calculada automaticamente (ex.: R$ 99,99 → R$ 119,99 = **+ R$ 20,00**).
- Valores aceitam "99,99", "R$ 1.234,56" ou "119.99".
- Pesquisa de cliente, filtros por período, plano e responsável.
- Histórico de upgrades por cliente, com o aumento acumulado.
- Indicadores: Upgrades realizados, Upgrades no mês, Aumento mensal de receita e Plano mais vendido.

**Clientes sem duplicidade:** os formulários permitem pesquisar um cliente já cadastrado. Ao informar um código ou CPF existente, os dados são carregados automaticamente e o cadastro é reaproveitado.

**Relatórios** → nova aba **Negociações e Upgrades**
- Filtros por dia, mês, ano e responsável.
- **PDF de negociações:** clientes em negociação, clientes bloqueados, motivos dos bloqueios e negociações convertidas em contratação (com taxa de conversão).
- **PDF de upgrades:** upgrades realizados, aumento de receita mensal, aumento médio, projeção anual, distribuição por plano e por responsável.
- Os PDFs seguem o padrão do relatório de OS: logo VEXFO no canto superior direito, cabeçalho repetido em todas as páginas, quebra automática e rodapé "Página X de Y".
- A aba "Ordens de Serviço" continua exatamente como antes.

## Rodar localmente

```bash
npm install
npm run dev
```

Acesse http://localhost:5173 e entre com um usuário **administrador**.

## Publicar na Netlify

1. Aplique a migration (seção acima).
2. Na Netlify: Build command `npm run build` e Publish directory `dist` (já configurados em `netlify.toml`).
3. Variáveis de ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (e `VITE_SUPABASE_PROJECT_ID`, se usado).
4. Faça o deploy pelo repositório conectado, ou rode `npm run build` e arraste a pasta `dist` em *Deploys* na Netlify.

## Observação

O menu lateral do sistema aparece somente em telas a partir de 768 px (comportamento já existente).
As telas novas são responsivas, mas no celular a navegação entre módulos continua dependendo desse menu.
