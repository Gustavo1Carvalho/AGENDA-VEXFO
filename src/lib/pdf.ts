/**
 * Gerador de PDF dos relatórios da Agenda VEXFO Fibra.
 *
 * Gera um PDF 1.4 válido sem dependências externas:
 * - fontes padrão Helvetica / Helvetica-Bold com WinAnsiEncoding (acentuação em português);
 * - medição real da largura do texto (métricas AFM) para quebra automática de linhas;
 * - quebra automática de páginas, com cabeçalho + logo repetidos em todas as páginas;
 * - seções por categoria de serviço, cada uma com quantidade e detalhamento das OS;
 * - rodapé com data de geração e numeração "Página X de Y".
 */
import logoUrl from "@/assets/vexfo-logo.png";

export type PdfReportRow = {
  date: string;
  time: string;
  client: string;
  technician: string;
  type: string;
  neighborhood: string;
  status: string;
  phone?: string;
  address?: string;
  reference?: string;
  notes?: string;
};
export type PdfReportSection = { label: string; value: number };
export type PdfReportArgs = {
  title: string;
  period: string;
  stats: Array<{ label: string; value: number }>;
  typeBreakdown?: PdfReportSection[];
  statusBreakdown?: PdfReportSection[];
  rows: PdfReportRow[];
  generatedAt?: Date;
};
export type PdfLogo = { bytes: Uint8Array; width: number; height: number };

type RGB = readonly [number, number, number];

/* ------------------------------------------------------------------------ */
/* Codificação de texto (WinAnsiEncoding)                                   */
/* ------------------------------------------------------------------------ */

/** Caracteres da faixa 0x80–0x9F do WinAnsi (os demais coincidem com Latin-1). */
const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  ƒ: 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  ˆ: 0x88,
  "‰": 0x89,
  Š: 0x8a,
  "‹": 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  š: 0x9a,
  "›": 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

function winAnsiCode(ch: string): number | null {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x20 && cp <= 0x7e) return cp;
  if (cp >= 0xa0 && cp <= 0xff) return cp;
  return WIN_ANSI_EXTRA[ch] ?? null;
}

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Símbolos comuns fora do WinAnsi com equivalente legível. */
const ASCII_FALLBACK: Record<string, string> = {
  "−": "-", // sinal de menos
  "→": "->",
  "←": "<-",
  "≤": "<=",
  "≥": ">=",
};
const INVISIBLE_OR_EMOJI = /[\p{Cc}\p{Cf}\p{Extended_Pictographic}︎️]/u;

/**
 * Converte qualquer valor em texto representável pelas fontes do PDF.
 * Mantém acentos do português; caracteres fora do WinAnsi perdem o diacrítico
 * (ex.: "ő" -> "o"); emojis e caracteres de controle são descartados.
 */
export function normalizePdfText(value: unknown, keepLineBreaks = false): string {
  let s = String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n");
  s = keepLineBreaks ? s.replace(/[^\S\n]+/g, " ") : s.replace(/\s+/g, " ");
  let out = "";
  for (const ch of s) {
    if (ch === "\n" || winAnsiCode(ch) !== null) {
      out += ch;
      continue;
    }
    const base = ch.normalize("NFD").replace(COMBINING_MARKS, "");
    if (ASCII_FALLBACK[ch]) out += ASCII_FALLBACK[ch];
    else if (base && [...base].every((c) => winAnsiCode(c) !== null)) out += base;
    else if (!INVISIBLE_OR_EMOJI.test(ch)) out += "?";
  }
  return keepLineBreaks ? out.replace(/ *\n */g, "\n").trim() : out.trim();
}

/** Monta uma string literal PDF "(...)" escapando \ ( ) e usando octal fora do ASCII. */
function pdfLiteral(text: string): string {
  let out = "(";
  for (const ch of text) {
    const code = winAnsiCode(ch) ?? 0x3f; // "?"
    if (ch === "\\" || ch === "(" || ch === ")") out += `\\${ch}`;
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else out += `\\${code.toString(8).padStart(3, "0")}`;
  }
  return `${out})`;
}

/** Texto Unicode para o dicionário /Info (UTF-16BE com BOM). */
function pdfUnicodeString(text: string): string {
  let hex = "<FEFF";
  for (let i = 0; i < text.length; i++)
    hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  return `${hex}>`;
}

function pdfDate(d: Date): string {
  const p = (v: number) => String(Math.floor(Math.abs(v))).padStart(2, "0");
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sign}${p(tz / 60)}'${p(tz % 60)}'`;
}

/* ------------------------------------------------------------------------ */
/* Métricas das fontes (Helvetica AFM, unidades de 1/1000 em)               */
/* ------------------------------------------------------------------------ */

// Larguras dos caracteres 32..126.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
// [regular, negrito] para símbolos fora do ASCII que não derivam de uma letra base.
const SPECIAL_WIDTHS: Record<string, readonly [number, number]> = {
  " ": [278, 278],
  ª: [370, 370],
  º: [365, 365],
  "°": [400, 400],
  ß: [611, 611],
  æ: [889, 889],
  Æ: [1000, 1000],
  "×": [584, 584],
  "«": [556, 556],
  "»": [556, 556],
  "§": [556, 556],
  "·": [278, 278],
  "–": [556, 556],
  "—": [1000, 1000],
  "‘": [222, 278],
  "’": [222, 278],
  "“": [333, 500],
  "”": [333, 500],
  "•": [350, 350],
  "…": [1000, 1000],
  "€": [556, 556],
  "™": [1000, 1000],
};

function charWidth(ch: string, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 32 && cp <= 126) return table[cp - 32];
  const special = SPECIAL_WIDTHS[ch];
  if (special) return bold ? special[1] : special[0];
  const base = ch.normalize("NFD").charAt(0);
  if (base === "i") return 278; // í, ì, î, ï usam o "i" sem pingo (mais largo)
  const bcp = base.codePointAt(0) ?? 0;
  if (base !== ch && bcp >= 32 && bcp <= 126) return table[bcp - 32];
  return bold ? 611 : 556;
}

function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of text) units += charWidth(ch, bold);
  return (units * size) / 1000;
}

/** Quebra o texto em linhas que cabem em maxWidth (palavras longas são partidas). */
function wrapText(text: string, maxWidth: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ").filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      let rest = word;
      while (rest.length > 1 && textWidth(rest, size, bold) > maxWidth) {
        let cut = 1;
        while (cut < rest.length - 1 && textWidth(rest.slice(0, cut + 1), size, bold) <= maxWidth)
          cut++;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

/** Reduz o texto com "…" para caber em maxWidth (usado apenas em títulos fixos). */
function fitText(text: string, maxWidth: number, size: number, bold = false): string {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && textWidth(`${t}…`, size, bold) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/* ------------------------------------------------------------------------ */
/* Layout                                                                    */
/* ------------------------------------------------------------------------ */

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 32;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_TOP = PAGE_H - 30;
const CONTENT_TOP = PAGE_H - 104;
const CONTENT_BOTTOM = 48;
const LINE_FACTOR = 1.3;
const CELL_PAD_X = 4;
const CELL_PAD_Y = 4;
const LOGO_BOX_W = 70;
const LOGO_BOX_H = 56;

/** Largura útil da página (A4 menos margens) — a soma das colunas de uma tabela deve ser igual a ela. */
export const PDF_CONTENT_WIDTH = CONTENT_W;

const COLOR = {
  brand: [0.06, 0.27, 0.62] as RGB,
  text: [0.12, 0.14, 0.19] as RGB,
  muted: [0.42, 0.45, 0.51] as RGB,
  rule: [0.84, 0.86, 0.9] as RGB,
  headBg: [0.9, 0.93, 0.98] as RGB,
  cardBg: [0.95, 0.96, 0.98] as RGB,
  zebra: [0.975, 0.98, 0.99] as RGB,
  white: [1, 1, 1] as RGB,
  green: [0.07, 0.5, 0.24] as RGB,
  red: [0.75, 0.13, 0.13] as RGB,
  amber: [0.7, 0.42, 0] as RGB,
};
export const PDF_COLORS: Readonly<typeof COLOR> = COLOR;

const CATEGORIES = [
  { title: "Instalações", keys: ["instalacao", "instalacoes"] },
  { title: "Manutenções", keys: ["manutencao", "manutencoes"] },
  { title: "Visitas técnicas", keys: ["visita tecnica", "visitas tecnicas", "visita_tecnica"] },
  {
    title: "Trocas de roteador",
    keys: ["troca de roteador", "trocas de roteador", "troca_roteador"],
  },
  {
    title: "Retiradas de equipamentos",
    keys: ["retirada de equipamento", "retiradas de equipamentos", "retirada_equipamento"],
  },
];

/** Chave de comparação: sem acentos, minúsculas e espaços normalizados. */
export function pdfMatchKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function statusColor(status: string): RGB {
  const k = pdfMatchKey(status);
  if (k.startsWith("finaliz")) return COLOR.green;
  if (k.startsWith("cancel")) return COLOR.red;
  if (k.startsWith("pendente")) return COLOR.amber;
  return COLOR.brand;
}

/** Converte "dd/mm/aaaa" + "hh:mm" em chave ordenável; null se o formato for outro. */
function sortKey(row: PdfReportRow): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.date.trim());
  return m ? `${m[3]}${m[2]}${m[1]}${row.time.trim()}` : null;
}

const num = (v: number) => String(Math.round(v * 100) / 100);
const rgb = (c: RGB) => c.map(num).join(" ");

/** Parágrafo de uma célula: o texto é quebrado automaticamente na largura da coluna. */
export type PdfPara = { text: string; bold?: boolean; size?: number; color?: RGB };
type Para = PdfPara;
type Line = { text: string; bold: boolean; size: number; color: RGB };
type Cell = { paras: Para[]; align?: "left" | "right" };
type LaidCell = { lines: Line[]; align: "left" | "right" };

const lineHeight = (size: number) => size * LINE_FACTOR;

function layoutCell(cell: Cell, width: number, defaultSize: number): LaidCell {
  const lines: Line[] = [];
  for (const p of cell.paras) {
    const size = p.size ?? defaultSize;
    const bold = p.bold ?? false;
    const color = p.color ?? COLOR.text;
    for (const t of wrapText(p.text, width - CELL_PAD_X * 2, size, bold))
      lines.push({ text: t, bold, size, color });
  }
  return { lines, align: cell.align ?? "left" };
}

const linesHeight = (lines: Line[]) => lines.reduce((h, l) => h + lineHeight(l.size), 0);

/* ------------------------------------------------------------------------ */
/* Construtor genérico de relatórios VEXFO                                   */
/* ------------------------------------------------------------------------ */

export type PdfStat = { label: string; value: string | number };
export type PdfSummaryTable = {
  title: string;
  /** Cabeçalhos das 3 colunas: rótulo, valor e complemento (ex.: "% do total"). */
  headers: [string, string, string];
  rows: Array<{ label: string; value: string | number; extra: string }>;
  emptyLabel?: string;
  /** Larguras das colunas de valor e complemento (padrão [50, 50]). */
  valueWidths?: [number, number];
};
export type PdfColumn<T> = { label: string; width: number; cell: (row: T) => PdfPara[] };
export type PdfTableSection<T> = {
  title: string;
  countLabel: string;
  rows: T[];
  columns: PdfColumn<T>[];
  /** Texto exibido em largura total abaixo da linha ("Observações: ..."). */
  notes?: (row: T) => string | null | undefined;
  emptyMessage: string;
};

/**
 * Cria um relatório com o padrão visual VEXFO: cabeçalho com logo repetido em
 * todas as páginas, quebra automática de linhas/páginas e rodapé numerado.
 */
export function createPdfReport(opts: {
  title: string;
  period: string;
  logo: PdfLogo | null;
  generatedAt?: Date;
}) {
  const generatedAt = opts.generatedAt ?? new Date();
  const title = normalizePdfText(opts.title) || "Relatório";
  const period = normalizePdfText(opts.period);
  const logo = opts.logo;

  const pages: string[][] = [];
  let page: string[] = [];
  let y = CONTENT_TOP;
  let onPageBreak: (() => void) | null = null;

  /* ---- primitivas de desenho ---- */
  const text = (
    s: string,
    x: number,
    baseline: number,
    size: number,
    o: { bold?: boolean; color?: RGB; align?: "left" | "right" } = {},
  ) => {
    const bold = o.bold ?? false;
    const tx = o.align === "right" ? x - textWidth(s, size, bold) : x;
    page.push(
      `BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${rgb(o.color ?? COLOR.text)} rg 1 0 0 1 ${num(tx)} ${num(baseline)} Tm ${pdfLiteral(s)} Tj ET`,
    );
  };
  const fillRect = (x: number, yy: number, w: number, h: number, color: RGB) =>
    page.push(`q ${rgb(color)} rg ${num(x)} ${num(yy)} ${num(w)} ${num(h)} re f Q`);
  const hLine = (x1: number, x2: number, yy: number, color: RGB, width = 0.5) =>
    page.push(
      `q ${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(yy)} m ${num(x2)} ${num(yy)} l S Q`,
    );

  /** Desenha linhas de texto a partir do topo `top`, dentro da coluna [x, x+width]. */
  const drawLines = (
    lines: Line[],
    x: number,
    width: number,
    top: number,
    align: "left" | "right",
  ) => {
    let cursor = top;
    for (const l of lines) {
      cursor -= lineHeight(l.size);
      const baseline = cursor + l.size * 0.3;
      const tx = align === "right" ? x + width - CELL_PAD_X : x + CELL_PAD_X;
      text(l.text, tx, baseline, l.size, { bold: l.bold, color: l.color, align });
    }
  };

  /* ---- páginas ---- */
  const drawPageHeader = (continuation: boolean) => {
    let logoW = 0;
    if (logo) {
      const scale = Math.min(LOGO_BOX_W / logo.width, LOGO_BOX_H / logo.height);
      logoW = logo.width * scale;
      const logoH = logo.height * scale;
      page.push(
        `q ${num(logoW)} 0 0 ${num(logoH)} ${num(PAGE_W - MARGIN - logoW)} ${num(HEADER_TOP - logoH)} cm /Logo Do Q`,
      );
    }
    const maxW = CONTENT_W - (logoW ? logoW + 14 : 0);
    text("VEXFO FIBRA", MARGIN, HEADER_TOP - 14, 17, { bold: true, color: COLOR.brand });
    text(
      fitText(continuation ? `${title} (continuação)` : title, maxW, 12, true),
      MARGIN,
      HEADER_TOP - 32,
      12,
      {
        bold: true,
      },
    );
    text(fitText(`Período: ${period}`, maxW, 9), MARGIN, HEADER_TOP - 47, 9, {
      color: COLOR.muted,
    });
    hLine(MARGIN, PAGE_W - MARGIN, HEADER_TOP - LOGO_BOX_H - 6, COLOR.brand, 1.2);
  };

  const newPage = () => {
    page = [];
    pages.push(page);
    y = CONTENT_TOP;
    drawPageHeader(pages.length > 1);
    onPageBreak?.();
  };

  /** Garante `h` pontos livres na página atual; caso contrário abre uma nova. */
  const ensure = (h: number) => {
    if (y - h < CONTENT_BOTTOM) newPage();
  };

  const heading = (label: string) => {
    ensure(60);
    text(normalizePdfText(label).toUpperCase(), MARGIN, y - 11, 10, {
      bold: true,
      color: COLOR.brand,
    });
    hLine(MARGIN, PAGE_W - MARGIN, y - 16, COLOR.rule, 0.7);
    y -= 24;
  };

  /* ---- tabela genérica com linhas de altura variável ---- */
  const drawTableHeader = (
    x: number,
    widths: number[],
    labels: string[],
    aligns?: Array<"left" | "right">,
  ) => {
    const size = 7;
    const laid = labels.map((l, i) =>
      layoutCell(
        { paras: [{ text: l, bold: true, size, color: COLOR.brand }], align: aligns?.[i] },
        widths[i],
        size,
      ),
    );
    const h = Math.max(...laid.map((c) => linesHeight(c.lines))) + CELL_PAD_Y * 2;
    const total = widths.reduce((a, b) => a + b, 0);
    fillRect(x, y - h, total, h, COLOR.headBg);
    let cx = x;
    laid.forEach((c, i) => {
      drawLines(c.lines, cx, widths[i], y - CELL_PAD_Y, c.align);
      cx += widths[i];
    });
    y -= h;
  };

  const drawRowAt = (x: number, widths: number[], cells: LaidCell[], h: number, bg?: RGB) => {
    const total = widths.reduce((a, b) => a + b, 0);
    if (bg) fillRect(x, y - h, total, h, bg);
    let cx = x;
    cells.forEach((c, i) => {
      drawLines(c.lines, cx, widths[i], y - CELL_PAD_Y, c.align);
      cx += widths[i];
    });
    y -= h;
  };

  const maxBlockHeight = () => CONTENT_TOP - CONTENT_BOTTOM - 80;

  /** Limita células absurdamente altas para que caibam numa página (nunca ocorre com dados normais). */
  const clampCells = (cells: LaidCell[], widths: number[]) => {
    const limit = maxBlockHeight() - CELL_PAD_Y * 2;
    cells.forEach((c, i) => {
      if (linesHeight(c.lines) <= limit) return;
      while (c.lines.length > 1 && linesHeight(c.lines) > limit) c.lines.pop();
      const last = c.lines[c.lines.length - 1];
      last.text = fitText(`${last.text}…`, widths[i] - CELL_PAD_X * 2, last.size, last.bold);
    });
  };

  /* ---- blocos de conteúdo ---- */

  /** Cards de indicadores (5 por linha). Valores longos têm a fonte reduzida para caber. */
  const statCards = (input: PdfStat[]) => {
    const stats = input.map((s) => ({
      label: normalizePdfText(s.label),
      value: normalizePdfText(String(s.value)),
    }));
    const cols = 5;
    const gap = 6;
    const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
    for (let r = 0; r < stats.length; r += cols) {
      const rowStats = stats.slice(r, r + cols);
      const labelLines = rowStats.map((s) => wrapText(s.label, cardW - 14, 7));
      // Valor: reduz a fonte até 9pt; se ainda não couber (texto longo), quebra em até 2 linhas.
      const maxW = cardW - 14;
      const values = rowStats.map((s) => {
        let size = 14;
        while (size > 9 && textWidth(s.value, size, true) > maxW) size -= 0.5;
        if (textWidth(s.value, size, true) <= maxW) return { size, lines: [s.value] };
        const wrapped = wrapText(s.value, maxW, size, true);
        const lines = wrapped.slice(0, 2);
        if (wrapped.length > 2) lines[1] = fitText(`${lines[1]}…`, maxW, size, true);
        return { size, lines };
      });
      const extraH = Math.max(0, ...values.map((v) => (v.lines.length - 1) * lineHeight(v.size)));
      const cardH = 12 + Math.max(...labelLines.map((l) => l.length)) * lineHeight(7) + 18 + extraH;
      ensure(cardH + gap);
      rowStats.forEach((s, i) => {
        const x = MARGIN + i * (cardW + gap);
        fillRect(x, y - cardH, cardW, cardH, COLOR.cardBg);
        fillRect(x, y - cardH, 2.5, cardH, COLOR.brand);
        let ly = y - 6;
        for (const l of labelLines[i]) {
          ly -= lineHeight(7);
          text(l, x + 8, ly + 2.1, 7, { color: COLOR.muted });
        }
        const v = values[i];
        v.lines.forEach((line, li) => {
          const baseline = y - cardH + 7 + (v.lines.length - 1 - li) * lineHeight(v.size);
          text(line, x + 8, baseline, v.size, { bold: true, color: COLOR.text });
        });
      });
      y -= cardH + gap;
    }
    y -= 10;
  };

  /** Duas tabelas-resumo lado a lado (ex.: por tipo e por status). */
  const summaryPair = (left: PdfSummaryTable, right: PdfSummaryTable) => {
    const halfGap = 14;
    const halfW = (CONTENT_W - halfGap) / 2;
    const aligns: Array<"left" | "right"> = ["left", "right", "right"];
    const build = (t: PdfSummaryTable) => {
      const vw = t.valueWidths ?? [50, 50];
      const widths = [halfW - vw[0] - vw[1], vw[0], vw[1]];
      const list = t.rows.length
        ? t.rows.map((it) => ({
            label: normalizePdfText(it.label),
            value: String(it.value),
            extra: it.extra,
          }))
        : [{ label: t.emptyLabel ?? "Sem dados", value: "0", extra: "—" }];
      const rows = list.map((it) => {
        const cells = [
          layoutCell({ paras: [{ text: it.label }] }, widths[0], 7.5),
          layoutCell(
            { paras: [{ text: normalizePdfText(it.value), bold: true }], align: "right" },
            widths[1],
            7.5,
          ),
          layoutCell(
            { paras: [{ text: normalizePdfText(it.extra), color: COLOR.muted }], align: "right" },
            widths[2],
            7.5,
          ),
        ];
        const h = Math.max(...cells.map((c) => linesHeight(c.lines))) + CELL_PAD_Y * 2;
        return { cells, h };
      });
      return { widths, rows };
    };
    const l = build(left);
    const r = build(right);
    const blockH = (rows: Array<{ h: number }>) => 22 + 18 + rows.reduce((a, b) => a + b.h, 0);
    ensure(Math.max(blockH(l.rows), blockH(r.rows)) + 10);
    const top = y;
    const draw = (x: number, t: PdfSummaryTable, b: ReturnType<typeof build>) => {
      y = top;
      text(normalizePdfText(t.title).toUpperCase(), x, y - 11, 9, {
        bold: true,
        color: COLOR.brand,
      });
      hLine(x, x + halfW, y - 16, COLOR.rule, 0.7);
      y -= 22;
      drawTableHeader(
        x,
        b.widths,
        t.headers.map((h) => normalizePdfText(h)),
        aligns,
      );
      b.rows.forEach((row, i) => {
        drawRowAt(x, b.widths, row.cells, row.h, i % 2 ? COLOR.zebra : undefined);
        hLine(x, x + halfW, y, COLOR.rule, 0.4);
      });
      return y;
    };
    const yLeft = draw(MARGIN, left, l);
    const yRight = draw(MARGIN + halfW + halfGap, right, r);
    y = Math.min(yLeft, yRight) - 18;
  };

  const sectionBand = (label: string, countLabel: string, continuation: boolean) => {
    const h = 20;
    fillRect(MARGIN, y - h, CONTENT_W, h, COLOR.brand);
    const name = `${label.toUpperCase()}${continuation ? " (continuação)" : ""}`;
    text(name, MARGIN + 8, y - 13.5, 9.5, { bold: true, color: COLOR.white });
    text(countLabel, PAGE_W - MARGIN - 8, y - 13.5, 8, { color: COLOR.white, align: "right" });
    y -= h;
  };

  /** Seção com faixa de título, tabela detalhada e observações em largura total. */
  const tableSection = <T>(spec: PdfTableSection<T>) => {
    const sectionTitle = normalizePdfText(spec.title);
    const countLabel = normalizePdfText(spec.countLabel);
    const rowSize = 7;
    ensure(20 + 22 + 40);
    y -= 4;
    sectionBand(sectionTitle, countLabel, false);

    if (!spec.rows.length) {
      text(normalizePdfText(spec.emptyMessage), MARGIN + 8, y - 14, 7.5, { color: COLOR.muted });
      y -= 22;
      hLine(MARGIN, PAGE_W - MARGIN, y + 2, COLOR.rule, 0.4);
      y -= 12;
      return;
    }

    const widths = spec.columns.map((c) => c.width);
    const labels = spec.columns.map((c) => normalizePdfText(c.label));
    const notesX = MARGIN + widths[0];
    const notesW = CONTENT_W - widths[0];

    drawTableHeader(MARGIN, widths, labels);
    onPageBreak = () => {
      sectionBand(sectionTitle, countLabel, true);
      drawTableHeader(MARGIN, widths, labels);
    };

    spec.rows.forEach((row, i) => {
      const cells: LaidCell[] = spec.columns.map((c, ci) =>
        layoutCell({ paras: c.cell(row) }, widths[ci], rowSize),
      );
      clampCells(cells, widths);
      const mainH = Math.max(...cells.map((c) => linesHeight(c.lines))) + CELL_PAD_Y * 2;

      const notes = normalizePdfText(spec.notes?.(row), true);
      const noteLines = notes
        ? layoutCell({ paras: [{ text: `Observações: ${notes}`, color: COLOR.text }] }, notesW, 6.8)
            .lines
        : [];
      const firstNoteH = noteLines.length ? lineHeight(noteLines[0].size) + CELL_PAD_Y : 0;
      const bg = i % 2 ? COLOR.zebra : undefined;

      // Mantém a linha principal (e ao menos a 1ª linha das observações) na mesma página.
      ensure(mainH + firstNoteH);
      drawRowAt(MARGIN, widths, cells, mainH, bg);

      // Observações: largura total, podendo continuar na página seguinte linha a linha.
      let rest = noteLines;
      while (rest.length) {
        const avail = y - CONTENT_BOTTOM - CELL_PAD_Y;
        let take = 0;
        let h = 0;
        while (take < rest.length && h + lineHeight(rest[take].size) <= avail) {
          h += lineHeight(rest[take].size);
          take++;
        }
        if (take === 0) {
          newPage();
          continue;
        }
        const chunk = rest.slice(0, take);
        rest = rest.slice(take);
        const chunkH = h + CELL_PAD_Y;
        if (bg) fillRect(notesX, y - chunkH, notesW, chunkH, bg);
        drawLines(chunk, notesX, notesW, y, "left");
        y -= chunkH;
        if (rest.length) newPage();
      }
      hLine(MARGIN, PAGE_W - MARGIN, y, COLOR.rule, 0.4);
    });

    onPageBreak = null;
    y -= 14;
  };

  /** Fecha o documento: rodapé numerado em todas as páginas e serialização. */
  const finish = (): Uint8Array<ArrayBuffer> => {
    const stamp = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(generatedAt);
    pages.forEach((p, i) => {
      page = p;
      hLine(MARGIN, PAGE_W - MARGIN, 34, COLOR.rule, 0.5);
      text(normalizePdfText(`Agenda VEXFO Fibra • Relatório gerado em ${stamp}`), MARGIN, 22, 7, {
        color: COLOR.muted,
      });
      text(`Página ${i + 1} de ${pages.length}`, PAGE_W - MARGIN, 22, 7, {
        color: COLOR.muted,
        align: "right",
      });
    });
    return serializePdf(
      pages.map((p) => p.join("\n")),
      logo,
      `${title} - ${period}`,
      generatedAt,
    );
  };

  newPage();
  return { heading, statCards, summaryPair, tableSection, finish };
}

/* ------------------------------------------------------------------------ */
/* Relatório de Ordens de Serviço                                            */
/* ------------------------------------------------------------------------ */

const OS_COLUMNS: PdfColumn<PdfReportRow>[] = [
  {
    label: "Data / Hora",
    width: 62,
    cell: (r) => [
      { text: normalizePdfText(r.date) || "—", bold: true },
      { text: normalizePdfText(r.time) || "—" },
    ],
  },
  {
    label: "Cliente / Telefone",
    width: 128,
    cell: (r) => {
      const phone = normalizePdfText(r.phone);
      return [
        { text: normalizePdfText(r.client) || "Cliente não informado", bold: true },
        phone ? { text: `Tel.: ${phone}` } : { text: "Tel.: não informado", color: COLOR.muted },
      ];
    },
  },
  {
    label: "Endereço / Bairro",
    width: 170,
    cell: (r) => {
      const address = normalizePdfText(r.address);
      const neighborhood = normalizePdfText(r.neighborhood);
      const reference = normalizePdfText(r.reference);
      return [
        address ? { text: address } : { text: "Endereço não informado", color: COLOR.muted },
        { text: `Bairro: ${neighborhood || "não informado"}` },
        ...(reference ? [{ text: `Ref.: ${reference}`, color: COLOR.muted }] : []),
      ];
    },
  },
  {
    label: "Técnico responsável",
    width: 95,
    cell: (r) => [{ text: normalizePdfText(r.technician) || "Sem técnico" }],
  },
  {
    label: "Status",
    width: CONTENT_W - 62 - 128 - 170 - 95,
    cell: (r) => {
      const status = normalizePdfText(r.status) || "—";
      return [{ text: status, bold: true, color: statusColor(status) }];
    },
  },
];

/** Monta o PDF completo de OS em memória. Função pura: não depende de DOM. */
export function buildVexfoReportPdf(
  args: PdfReportArgs,
  logo: PdfLogo | null,
): Uint8Array<ArrayBuffer> {
  const report = createPdfReport({
    title: normalizePdfText(args.title) || "Relatório de Ordens de Serviço",
    period: args.period,
    logo,
    generatedAt: args.generatedAt,
  });

  // ---- Resumo operacional (cards) ----
  report.heading("Resumo operacional");
  report.statCards(args.stats);

  // ---- Agrupamento por categoria ----
  const allRows = args.rows.map((r, idx) => ({ r, idx }));
  const used = new Set<number>();
  const groups = CATEGORIES.map((cat) => {
    const rows = allRows.filter(
      ({ r, idx }) => !used.has(idx) && cat.keys.includes(pdfMatchKey(r.type)),
    );
    rows.forEach(({ idx }) => used.add(idx));
    return { title: cat.title, rows };
  });
  const others = allRows.filter(({ idx }) => !used.has(idx));
  if (others.length) groups.push({ title: "Outros serviços", rows: others });
  for (const g of groups) {
    g.rows.sort((a, b) => {
      const ka = sortKey(a.r);
      const kb = sortKey(b.r);
      if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
      return a.idx - b.idx;
    });
  }

  const totalRows = args.rows.length;
  const pct = (v: number) =>
    totalRows
      ? `${((v / totalRows) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
      : "—";

  // ---- Resumo por categoria e por status (tabelas lado a lado) ----
  const typeSummary: PdfReportSection[] =
    args.typeBreakdown && args.typeBreakdown.length
      ? args.typeBreakdown
      : groups.map((g) => ({ label: g.title, value: g.rows.length }));
  const statusSummary: PdfReportSection[] = args.statusBreakdown ?? [];
  const toRows = (items: PdfReportSection[]) =>
    items.map((it) => ({ label: it.label, value: it.value, extra: pct(it.value) }));
  report.summaryPair(
    {
      title: "Resumo por tipo de serviço",
      headers: ["Categoria", "Qtd.", "% do total"],
      rows: toRows(typeSummary),
    },
    {
      title: "Resumo por status",
      headers: ["Status", "Qtd.", "% do total"],
      rows: toRows(statusSummary),
    },
  );

  // ---- Detalhamento por categoria ----
  report.heading("Detalhamento das ordens de serviço");
  for (const group of groups) {
    const count = group.rows.length;
    report.tableSection({
      title: group.title,
      countLabel: `${count} ${count === 1 ? "ordem de serviço" : "ordens de serviço"}`,
      rows: group.rows.map(({ r }) => r),
      columns: OS_COLUMNS,
      notes: (r) => r.notes,
      emptyMessage: "Nenhuma ordem de serviço desta categoria no período selecionado.",
    });
  }

  return report.finish();
}

/* ------------------------------------------------------------------------ */
/* Serialização do arquivo PDF                                              */
/* ------------------------------------------------------------------------ */

function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function serializePdf(
  pageStreams: string[],
  logo: PdfLogo | null,
  docTitle: string,
  created: Date,
) {
  const enc = new TextEncoder();
  const bodies: Uint8Array[][] = [];
  const reserve = () => {
    bodies.push([]);
    return bodies.length;
  };
  const set = (id: number, ...parts: Array<string | Uint8Array>) => {
    bodies[id - 1] = parts.map((p) => (typeof p === "string" ? enc.encode(p) : p));
  };

  const catalogId = reserve();
  const pagesId = reserve();
  const fontRegularId = reserve();
  const fontBoldId = reserve();
  const infoId = reserve();
  const logoId = logo ? reserve() : 0;

  set(
    fontRegularId,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  set(
    fontBoldId,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  if (logo) {
    set(
      logoId,
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`,
      logo.bytes,
      "\nendstream",
    );
  }

  const xObjects = logo ? ` /XObject << /Logo ${logoId} 0 R >>` : "";
  const resources = `<< /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>${xObjects} /ProcSet [/PDF /Text /ImageC] >>`;
  const kids: number[] = [];
  for (const content of pageStreams) {
    const contentId = reserve();
    const pageId = reserve();
    const data = enc.encode(content); // conteúdo é 100% ASCII (pdfLiteral usa escapes octais)
    set(contentId, `<< /Length ${data.length} >>\nstream\n`, data, "\nendstream");
    set(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources ${resources} /Contents ${contentId} 0 R >>`,
    );
    kids.push(pageId);
  }
  set(
    pagesId,
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`,
  );
  set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  set(
    infoId,
    `<< /Title ${pdfUnicodeString(docTitle)} /Author ${pdfUnicodeString("VEXFO Fibra")} /Creator ${pdfUnicodeString("Agenda VEXFO Fibra")} /Producer ${pdfUnicodeString("Agenda VEXFO Fibra")} /CreationDate (${pdfDate(created)}) >>`,
  );

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };
  push(enc.encode("%PDF-1.4\n"));
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // comentário binário recomendado

  const offsets: number[] = [];
  bodies.forEach((parts, i) => {
    offsets.push(offset);
    push(enc.encode(`${i + 1} 0 obj\n`));
    parts.forEach(push);
    push(enc.encode("\nendobj\n"));
  });

  const xrefOffset = offset;
  let xref = `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${bodies.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  push(enc.encode(xref));

  return concatBytes(chunks);
}

/* ------------------------------------------------------------------------ */
/* Navegador: logo + download                                               */
/* ------------------------------------------------------------------------ */

/** Carrega a logo oficial e converte para JPEG (fundo branco) para embutir no PDF. */
export async function loadVexfoLogo(src: string = logoUrl): Promise<PdfLogo | null> {
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Logo não carregou"));
      img.src = src;
    });
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const base64 = canvas.toDataURL("image/jpeg", 0.92).split(",")[1] ?? "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // Confere a assinatura JPEG (FF D8) antes de embutir.
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    return { bytes, width, height };
  } catch (err) {
    console.warn("[pdf] Não foi possível carregar a logo da VEXFO:", err);
    return null;
  }
}

/** Nome do arquivo: relatorio-vexfo[-tipo]-periodo.pdf (sem acentos/espaços). */
export function pdfFileName(period: string, kind?: string) {
  const slug = (v: string) =>
    pdfMatchKey(v)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const parts = ["relatorio-vexfo", kind ? slug(kind) : "", slug(period)].filter(Boolean);
  return `${parts.join("-")}.pdf`;
}

/** Inicia o download de um PDF já gerado. */
export function downloadPdfBytes(bytes: Uint8Array<ArrayBuffer>, fileName: string) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Gera o relatório de OS e inicia o download do arquivo PDF. */
export async function downloadVexfoReportPdf(args: PdfReportArgs): Promise<void> {
  const logo = await loadVexfoLogo();
  downloadPdfBytes(buildVexfoReportPdf(args, logo), pdfFileName(args.period));
}
