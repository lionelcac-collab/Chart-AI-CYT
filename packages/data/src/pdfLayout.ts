/**
 * Layout-preserving text from PDF text items (pdf.js / unpdf `getTextContent()`), similar to
 * `pdftotext -layout`: items are grouped into lines by their y position and placed at a character
 * column derived from their x position, so table columns stay aligned and are separated by 2+ spaces.
 * Pages are separated by a form feed (\f), as pdftotext does.
 */
export interface PdfTextItem { str: string; transform: number[]; width: number; height?: number }

export function layoutPage(items: PdfTextItem[]): string {
  const words = items.filter((i) => i.str && i.str.trim() !== '' && Array.isArray(i.transform));
  if (!words.length) return '';
  // Character width: median of width / length over the page.
  const cws = words.filter((w) => w.width > 0 && w.str.length > 0).map((w) => w.width / w.str.length).sort((a, b) => a - b);
  const cw = cws.length ? cws[Math.floor(cws.length / 2)]! : 5;
  const heights = words.map((w) => Math.abs(w.height ?? w.transform[3] ?? 8)).sort((a, b) => a - b);
  const tol = Math.max(1.5, (heights[Math.floor(heights.length / 2)] ?? 8) * 0.45);

  // Group by y (top to bottom).
  const sorted = [...words].sort((a, b) => b.transform[5]! - a.transform[5]! || a.transform[4]! - b.transform[4]!);
  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const w of sorted) {
    const y = w.transform[5]!;
    const line = lines.find((l) => Math.abs(l.y - y) <= tol);
    if (line) line.items.push(w); else lines.push({ y, items: [w] });
  }
  lines.sort((a, b) => b.y - a.y);

  const minX = Math.min(...words.map((w) => w.transform[4]!));
  return lines.map((l) => {
    let out = '';
    for (const w of l.items.sort((a, b) => a.transform[4]! - b.transform[4]!)) {
      const col = Math.round((w.transform[4]! - minX) / cw);
      if (col > out.length) out += ' '.repeat(col - out.length);
      else if (out.length && !out.endsWith(' ')) out += ' ';
      out += w.str;
    }
    return out.replace(/\s+$/, '');
  }).join('\n');
}

/** Minimal shape of a pdf.js document proxy. */
export interface PdfDoc { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }> }

export async function layoutText(doc: PdfDoc): Promise<string> {
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    pages.push(layoutPage(items as PdfTextItem[]));
  }
  return pages.join('\n\f');
}
