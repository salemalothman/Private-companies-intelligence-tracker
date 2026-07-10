/**
 * Shared PDF branding kit for the reports layer (digest + company memo).
 *
 * Owns the brand palette, the logo mark, a word-wrap helper, and `PdfCursor` —
 * a top-down drawing cursor with automatic page breaks that repaint a slim
 * running header on pages 2+. pdf-lib only: no Supabase, no React, no I/O, so
 * both `digest.ts` and `company-report.ts` can share it without duplicating
 * drawing code.
 */

import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

// Brand palette (mirrors the web design tokens, expressed as pdf-lib rgb).
export const TEAL = rgb(0.36, 0.62, 0.68);
export const INK = rgb(0.12, 0.18, 0.24);
export const MUTED = rgb(0.45, 0.5, 0.55);
export const GREEN = rgb(0.13, 0.55, 0.33);
export const RED = rgb(0.79, 0.16, 0.16);
/** Amber for stale-analysis notices — a caution, not an error. */
export const AMBER = rgb(0.72, 0.5, 0.11);
/** Hairline rule color, matching the web's near-invisible borders. */
export const HAIRLINE = rgb(0.85, 0.87, 0.9);

export type PdfColor = ReturnType<typeof rgb>;

/** Draw the brand mark (network graph in nodes) at (ox, oy-top) in a `box`pt square. */
export function drawLogo(page: PDFPage, ox: number, oyTop: number, box: number) {
  const s = box / 48;
  const X = (vx: number) => ox + vx * s;
  const Y = (vy: number) => oyTop - vy * s; // flip viewBox y-down to PDF y-up
  const nodes: [number, number, number][] = [
    [12, 33, 2.8],
    [20, 24, 2.8],
    [16, 15, 2.8],
    [31, 11, 3.2],
    [34, 20, 2.8],
  ];
  const lines: [number, number, number, number][] = [
    [12, 33, 20, 24],
    [20, 24, 16, 15],
    [16, 15, 31, 11],
    [20, 24, 34, 20],
  ];
  for (const [x1, y1, x2, y2] of lines) {
    page.drawLine({
      start: { x: X(x1), y: Y(y1) },
      end: { x: X(x2), y: Y(y2) },
      thickness: 1.6,
      color: TEAL,
    });
  }
  for (const [cx, cy, r] of nodes) {
    page.drawCircle({ x: X(cx), y: Y(cy), size: r * s, color: TEAL });
  }
}

/**
 * Greedy word-wrap: split `text` into lines that fit `maxWidth` at `size`.
 * The memo wraps long labelled prose rather than truncating (the digest
 * truncates because it is a fixed one-pager; the memo cannot lose content).
 * A single word wider than maxWidth is emitted on its own line unbroken.
 */
export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface PdfCursorOptions {
  /** Horizontal page margin in pt. */
  margin?: number;
  /** Starting y on the first page (below any custom header the caller drew). */
  top?: number;
  /** Minimum y before a page break triggers. */
  bottom?: number;
  /** Company name shown in the running header on pages 2+. */
  companyName: string;
  /** Right-aligned running-header label; page number is appended. */
  headerLabel?: string;
}

/**
 * A top-down drawing cursor over an A4 pdf-lib document. Every draw method
 * calls `ensureSpace` first, so callers never manage pagination: when a block
 * would cross the bottom margin, a new page is added and the slim running
 * header (small logo + company name + "LABEL · p. N" + hairline rule) is
 * painted before drawing continues.
 */
export class PdfCursor {
  readonly margin: number;
  readonly width = 595; // A4
  readonly height = 842;
  page: PDFPage;
  y: number;
  private readonly bottom: number;
  private readonly companyName: string;
  private readonly headerLabel: string;
  private pageNo = 1;
  /** End-x and baseline of the last drawn text line, for inline `tag`s. */
  private lastLineEndX = 0;
  private lastLineY = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly boldFont: PDFFont,
    opts: PdfCursorOptions,
  ) {
    this.margin = opts.margin ?? 48;
    this.bottom = opts.bottom ?? 56;
    this.companyName = opts.companyName;
    this.headerLabel = opts.headerLabel ?? "RESEARCH MEMO";
    this.page = doc.addPage([this.width, this.height]);
    this.y = opts.top ?? this.height - 42;
  }

  /** Usable content width between the margins. */
  get contentWidth(): number {
    return this.width - this.margin * 2;
  }

  /** Right content edge. */
  get right(): number {
    return this.width - this.margin;
  }

  /**
   * Guarantee `needed` pt of vertical room; otherwise start a new page and
   * paint the running header. Call before any multi-part block that must not
   * straddle a break (table header + first row, bar label + bar, …).
   */
  ensureSpace(needed: number): void {
    if (this.y - needed >= this.bottom) return;
    this.page = this.doc.addPage([this.width, this.height]);
    this.pageNo += 1;
    const top = this.height - 40;
    // Slim running header: small logo + company name, label · p. N, hairline.
    drawLogo(this.page, this.margin, top + 14, 16);
    this.page.drawText(this.companyName, {
      x: this.margin + 22,
      y: top,
      size: 9,
      font: this.boldFont,
      color: INK,
    });
    const label = `${this.headerLabel} · p. ${this.pageNo}`;
    this.page.drawText(label, {
      x: this.right - this.font.widthOfTextAtSize(label, 8),
      y: top,
      size: 8,
      font: this.font,
      color: MUTED,
    });
    this.page.drawLine({
      start: { x: this.margin, y: top - 8 },
      end: { x: this.right, y: top - 8 },
      thickness: 0.5,
      color: HAIRLINE,
    });
    this.y = top - 26;
  }

  /** Draw one line of text at the cursor and advance. Does not wrap. */
  text(
    str: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: PdfColor;
      indent?: number;
      lineGap?: number;
    } = {},
  ): void {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.boldFont : this.font;
    const lineHeight = size + (opts.lineGap ?? 4);
    this.ensureSpace(lineHeight);
    const x = this.margin + (opts.indent ?? 0);
    this.y -= size;
    this.page.drawText(str, {
      x,
      y: this.y,
      size,
      font,
      color: opts.color ?? INK,
    });
    this.lastLineEndX = x + font.widthOfTextAtSize(str, size);
    this.lastLineY = this.y;
    this.y -= opts.lineGap ?? 4;
  }

  /**
   * Draw a small muted inline tag (e.g. "[est · med]") right after the last
   * text line — the honest basis/confidence marker required on every
   * forward-looking statement. No-op when nothing was drawn yet.
   */
  tag(str: string): void {
    if (!this.lastLineY) return;
    this.page.drawText(str, {
      x: this.lastLineEndX + 5,
      y: this.lastLineY,
      size: 7,
      font: this.font,
      color: MUTED,
    });
  }

  /** Hairline horizontal rule across the content width. */
  rule(opts: { color?: PdfColor; thickness?: number; gap?: number } = {}): void {
    const gap = opts.gap ?? 8;
    this.ensureSpace(gap * 2);
    this.y -= gap;
    this.page.drawLine({
      start: { x: this.margin, y: this.y },
      end: { x: this.right, y: this.y },
      thickness: opts.thickness ?? 0.5,
      color: opts.color ?? HAIRLINE,
    });
    this.y -= gap;
  }

  /** Muted uppercase section heading with breathing room above. */
  sectionTitle(str: string): void {
    this.ensureSpace(34);
    this.y -= 10;
    this.text(str.toUpperCase(), { size: 9, bold: true, color: MUTED });
    this.y -= 4;
  }

  /** Bulleted, word-wrapped line(s): teal dot + hanging indent. */
  bullet(str: string, opts: { size?: number } = {}): void {
    const size = opts.size ?? 9;
    const indent = 12;
    const lines = wrapText(str, this.font, size, this.contentWidth - indent);
    lines.forEach((line, i) => {
      const lineHeight = size + 4;
      this.ensureSpace(lineHeight);
      if (i === 0) {
        this.page.drawCircle({
          x: this.margin + 3,
          y: this.y - size + 3,
          size: 2,
          color: TEAL,
        });
      }
      this.text(line, { size, indent });
    });
  }

  /** Word-wrapped paragraph at the cursor; optional trailing inline tag. */
  paragraph(
    str: string,
    opts: { size?: number; color?: PdfColor; indent?: number; tag?: string } = {},
  ): void {
    const size = opts.size ?? 9.5;
    const indent = opts.indent ?? 0;
    const lines = wrapText(str, this.font, size, this.contentWidth - indent);
    for (const line of lines) {
      this.text(line, { size, color: opts.color, indent });
    }
    if (opts.tag) this.tag(opts.tag);
  }

  /** Extra vertical whitespace. */
  gap(pt: number): void {
    this.y -= pt;
  }
}
