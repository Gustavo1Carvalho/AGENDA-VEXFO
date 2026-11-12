# Agenda VEXFO Fibra — Atualização 02/09/2026

## Correções e melhorias
- Corrigido o erro `formatDateBR is not defined` na página de Ordens de Serviço.
- Mantida a correção de datas de PostgreSQL `DATE` sem conversão UTC, evitando aparecer um dia anterior.
- Relatórios continuam em PDF.
- PDF com logo da VEXFO no canto superior direito.
- Relatório detalhado com resumo e contagem por tipo:
  - Instalação
  - Manutenção
  - Visita Técnica
  - Troca de Roteador
  - Retirada de Equipamento
- Relatório também apresenta distribuição por status e tabela detalhada das OS.
- Conexão com Lovable Cloud/Supabase foi preservada.

## Rodar localmente
```bash
npm install
npm run dev
```

## Gerar deploy
```bash
npm run build
```

Depois envie a pasta `dist` para a Netlify.

## Observação
O pacote contém o código-fonte atualizado. A pasta `dist` é gerada localmente pelo comando `npm run build`, para garantir que o build seja produzido no ambiente de execução do projeto.
