import {
  minutesToTime,
  parseClock,
  parseTimetable,
  parseWeekday,
  timeToMinutes,
  WEEKDAY_LABEL,
  type Weekday,
} from "@/lib/timetable";

export interface ExtractProgress {
  message: string;
  progress: number;
}

export interface ExtractTimetableResult {
  text: string;
  source: "text" | "pdf" | "image";
  warning?: string;
}

function extensionOf(file: File): string {
  return file.name.toLowerCase().split(".").pop() ?? "";
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || extensionOf(file) === "pdf";
}

function isImage(file: File): boolean {
  return (
    file.type.startsWith("image/") || /^(png|jpe?g|webp|bmp|gif|tiff?)$/.test(extensionOf(file))
  );
}

function report(
  onProgress: ((value: ExtractProgress) => void) | undefined,
  message: string,
  progress: number,
) {
  onProgress?.({ message, progress: Math.max(0, Math.min(1, progress)) });
}

const DAY_SIGNAL_RE =
  /\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday|rday)?|fri(?:day)?|sat(?:urday)?)\b/gi;
const TIME_SIGNAL_RE = /\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s*(?:-|–|—|to|until|till)\s*\d{1,2}/gi;
const ROOM_SIGNAL_RE = /\b(?:CSED|LT|LP|LAB|SAC)[\s-]?[A-Z0-9]{1,6}\b/gi;

/** Rough score of how much a block of text looks like a timetable. */
function timetableSignalScore(text: string): number {
  const days = new Set((text.match(DAY_SIGNAL_RE) ?? []).map((item) => item.toLowerCase()));
  const times = text.match(TIME_SIGNAL_RE)?.length ?? 0;
  const rooms = text.match(ROOM_SIGNAL_RE)?.length ?? 0;
  return days.size + times + rooms;
}

function looksLikeTimetable(text: string): boolean {
  return timetableSignalScore(text) >= 3;
}

function tidyOcrText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: Array<{ x: number; y: number; text: string }> = [];
    content.items.forEach((item) => {
      if (!("str" in item) || !item.str.trim()) return;
      items.push({
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        text: item.str,
      });
    });
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    let currentY: number | null = null;
    let row: string[] = [];
    items.forEach((item) => {
      if (currentY === null || Math.abs(item.y - currentY) > 2.5) {
        if (row.length > 0) lines.push(row.join(" "));
        currentY = item.y;
        row = [item.text];
      } else {
        row.push(item.text);
      }
    });
    if (row.length > 0) lines.push(row.join(" "));
    lines.push("");
  }

  return tidyOcrText(lines.join("\n"));
}

function blobToCanvas(image: Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(image);
    const element = new Image();
    element.onload = () => {
      try {
        resolve(drawToCanvas(element, element.naturalWidth, element.naturalHeight));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open that image."));
    };
    element.src = url;
  });
}

function drawToCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  scale = 1,
): HTMLCanvasElement {
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the image for reading.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function scaledCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  // Phones produce very large photos while screenshots are often too small.
  // Bring both into the 1,800–2,600 px range Tesseract handles best.
  let scale = 1;
  if (source.width < 1400) scale = Math.min(4, 2000 / Math.max(1, source.width));
  else if (source.width > 2600) scale = 2600 / source.width;
  return drawToCanvas(source, source.width, source.height, scale);
}

function grayscaleCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = drawToCanvas(source, source.width, source.height);
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const histogram = new Array<number>(256).fill(0);

  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(
      0.299 * (pixels[i] ?? 0) + 0.587 * (pixels[i + 1] ?? 0) + 0.114 * (pixels[i + 2] ?? 0),
    );
    pixels[i] = gray;
    pixels[i + 1] = gray;
    pixels[i + 2] = gray;
    histogram[gray] = (histogram[gray] ?? 0) + 1;
  }

  // Stretch the 2nd–98th percentile to full contrast. This removes grey
  // shadows from phone photos without clipping the text.
  const total = canvas.width * canvas.height;
  let low = 0;
  let high = 255;
  let accumulated = 0;
  for (let value = 0; value < 256; value += 1) {
    accumulated += histogram[value] ?? 0;
    if (accumulated > total * 0.02) {
      low = value;
      break;
    }
  }
  accumulated = 0;
  for (let value = 255; value >= 0; value -= 1) {
    accumulated += histogram[value] ?? 0;
    if (accumulated > total * 0.02) {
      high = value;
      break;
    }
  }
  if (high <= low) {
    low = 0;
    high = 255;
  }
  const span = high - low || 1;
  for (let i = 0; i < pixels.length; i += 4) {
    const stretched = Math.max(0, Math.min(255, Math.round(((pixels[i] ?? 0) - low) / span) * 255));
    pixels[i] = stretched;
    pixels[i + 1] = stretched;
    pixels[i + 2] = stretched;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function otsuThreshold(histogram: number[], total: number): number {
  let sum = 0;
  for (let value = 0; value < 256; value += 1) sum += value * (histogram[value] ?? 0);
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let threshold = 127;
  for (let value = 0; value < 256; value += 1) {
    weightBackground += histogram[value] ?? 0;
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += value * (histogram[value] ?? 0);
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      threshold = value;
    }
  }
  return threshold;
}

function binarizeCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = grayscaleCanvas(source);
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = pixels[i] ?? 0;
    histogram[gray] = (histogram[gray] ?? 0) + 1;
  }
  const threshold = otsuThreshold(histogram, canvas.width * canvas.height);
  for (let i = 0; i < pixels.length; i += 4) {
    const value = (pixels[i] ?? 0) > threshold ? 255 : 0;
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

async function prepareForOcr(
  image: Blob | HTMLCanvasElement,
): Promise<{ grayscale: HTMLCanvasElement; binary: HTMLCanvasElement }> {
  const source =
    typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement
      ? image
      : await blobToCanvas(image as Blob);
  const scaled = scaledCanvas(source);
  return { grayscale: grayscaleCanvas(scaled), binary: binarizeCanvas(scaled) };
}

interface OcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
}

interface OcrLine {
  y: number;
  height: number;
  words: OcrWord[];
}

function numberOr(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Reads word boxes out of Tesseract's TSV output (level 5 rows). */
export function parseOcrTsv(tsv: string): OcrWord[][] {
  const groups = new Map<string, OcrWord[]>();
  const rows = tsv.split(/\r?\n/);

  rows.forEach((row) => {
    const columns = row.split("\t");
    if (columns.length < 12 || columns[0] !== "5") return;
    const text = (columns[11] ?? "").trim();
    if (!text) return;
    const confidence = numberOr(columns[10], 100);
    if (confidence < 20) return;
    const word: OcrWord = {
      text,
      left: numberOr(columns[6]),
      top: numberOr(columns[7]),
      width: numberOr(columns[8]),
      height: numberOr(columns[9]),
      confidence,
    };
    const key = `${columns[1]}:${columns[2]}:${columns[3]}:${columns[4]}`;
    const group = groups.get(key);
    if (group) group.push(word);
    else groups.set(key, [word]);
  });

  const rawLines = [...groups.values()]
    .map((words) => {
      const sorted = [...words].sort((a, b) => a.left - b.left);
      const height = Math.max(...sorted.map((word) => word.height), 1);
      const y =
        sorted.reduce((total, word) => total + word.top + word.height / 2, 0) / sorted.length;
      return { y, height, words: sorted };
    })
    .sort((a, b) => a.y - b.y);

  // Tesseract sometimes splits one table row into "cells" on slightly
  // different baselines. Merge nearby lines so a row stays one row.
  const merged: OcrLine[] = [];
  rawLines.forEach((line) => {
    const previous = merged.at(-1);
    const tolerance = previous ? Math.max(8, previous.height * 0.7) : 0;
    if (previous && Math.abs(line.y - previous.y) <= tolerance) {
      const words = [...previous.words, ...line.words].sort((a, b) => a.left - b.left);
      const height = Math.max(previous.height, line.height);
      const y =
        (previous.y * previous.words.length + line.y * line.words.length) /
        Math.max(1, previous.words.length + line.words.length);
      merged[merged.length - 1] = { y, height, words };
    } else {
      merged.push(line);
    }
  });

  return merged.map((line) => line.words);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function centerOf(word: OcrWord): number {
  return word.left + word.width / 2;
}

/** Rebuilds plain OCR text, keeping clear column gaps as " | " markers. */
export function ocrLinesToLayoutText(groups: OcrWord[][]): string {
  const lines: string[] = [];
  groups.forEach((words) => {
    if (words.length === 0) return;
    const height = median(words.map((word) => word.height)) || 16;
    const typicalGap = Math.max(10, height * 0.6);
    let line = "";
    let previousRight: number | null = null;
    words
      .slice()
      .sort((a, b) => a.left - b.left)
      .forEach((word) => {
        if (previousRight !== null) {
          const gap = word.left - previousRight;
          line += gap > typicalGap * 2.6 ? " | " : " ";
        }
        line += word.text;
        previousRight = word.left + word.width;
      });
    const clean = line.trim();
    if (clean) lines.push(clean);
  });
  return tidyOcrText(lines.join("\n"));
}

const OCR_RANGE_RE =
  /(\d{1,2}(?:[:.]\d{1,2})?)\s*(?:-|–|—|~|to|till|until)\s*(\d{1,2}(?:[:.]\d{1,2})?)(?:\s*(?:am|pm))?/i;

function normalizeHm(raw: string): string | null {
  const lower = raw.toLowerCase();
  const parsed = parseClock(lower);
  if (!parsed) return null;
  if (/am|pm/.test(lower)) return parsed;
  const hour = Number(parsed.slice(0, 2));
  // Campus timetables run from morning to early evening: bare 1–7 means PM.
  if (hour >= 1 && hour <= 7) return `${String(hour + 12).padStart(2, "0")}${parsed.slice(2)}`;
  return parsed;
}

function timeRangeIn(text: string): string | null {
  const match = text.match(OCR_RANGE_RE);
  if (!match?.[1] || !match[2]) return null;
  const start = normalizeHm(match[1]);
  const end = normalizeHm(match[2]);
  if (!start || !end || timeToMinutes(end) <= timeToMinutes(start)) return null;
  return `${start}-${end}`;
}

function clockIn(text: string): string | null {
  const match = text.match(
    /(?:^|\s)(\d{1,2}(?:[:.]\d{1,2})\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))(?=\s|$)/i,
  );
  return match?.[1] ? normalizeHm(match[1]) : null;
}

/** A cell that is mostly a time, not a subject that happens to contain digits. */
function cellTime(text: string): { range?: string; clock?: string } | null {
  const range = timeRangeIn(text);
  if (range && text.replace(OCR_RANGE_RE, "").replace(/[^a-z0-9]/gi, "").length <= 6) {
    return { range };
  }
  const clock = clockIn(text);
  if (clock) {
    const token = text.match(
      /(?:^|\s)(\d{1,2}(?:[:.]\d{1,2})\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))(?=\s|$)/i,
    );
    const residual = token ? text.replace(token[0], "").replace(/[^a-z0-9]/gi, "") : text;
    if (residual.length <= 6) return { clock };
  }
  return null;
}

interface DayColumn {
  day: Weekday;
  left: number;
  center: number;
}

function dayColumns(words: OcrWord[]): DayColumn[] {
  const found: DayColumn[] = [];
  words.forEach((word) => {
    const day = parseWeekday(word.text.replace(/[^A-Za-z]/g, ""));
    if (day === null) return;
    if (found.some((column) => column.day === day)) return;
    found.push({ day, left: word.left, center: centerOf(word) });
  });
  return found.sort((a, b) => a.left - b.left);
}

function splitIntoCells(words: OcrWord[], gapFactor = 2.4): OcrWord[][] {
  const sorted = [...words].sort((a, b) => a.left - b.left);
  const height = median(sorted.map((word) => word.height)) || 16;
  const gapLimit = Math.max(16, height * gapFactor);
  const cells: OcrWord[][] = [];
  let current: OcrWord[] = [];
  let previousRight: number | null = null;

  sorted.forEach((word) => {
    if (previousRight !== null && word.left - previousRight > gapLimit) {
      if (current.length > 0) cells.push(current);
      current = [];
    }
    current.push(word);
    previousRight = Math.max(previousRight ?? 0, word.left + word.width);
  });
  if (current.length > 0) cells.push(current);
  return cells;
}

function cellText(cell: OcrWord[]): string {
  return cell
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function bucketFor(left: number, boundaries: number[]): number {
  let bucket = 0;
  while (bucket < boundaries.length && left >= (boundaries[bucket] ?? Infinity)) bucket += 1;
  return bucket;
}

function splitDaysAndGrid(groups: OcrWord[][]): string | null {
  // Header row: at least two day names side by side → days are columns.
  let headerIndex = -1;
  let columns: DayColumn[] = [];
  groups.forEach((words, index) => {
    const found = dayColumns(words);
    if (found.length > columns.length) {
      columns = found;
      headerIndex = index;
    }
  });
  if (columns.length < 2 || headerIndex < 0) return null;

  const lefts = columns.map((column) => column.left);
  const spacing =
    lefts.length > 1
      ? median(lefts.slice(1).map((left, index) => left - (lefts[index] ?? left)))
      : 200;
  const timeLimit = (lefts[0] ?? 0) - spacing / 2;
  const boundaries = lefts.slice(1).map((left, index) => ((lefts[index] ?? left) + left) / 2);

  const out: string[] = [];
  groups.forEach((words, index) => {
    if (index <= headerIndex) return;
    if (dayColumns(words).length >= 2) return;

    const cells = splitIntoCells(words);
    const timeText = cells
      .filter((cell) => (cell[0]?.left ?? Infinity) < timeLimit)
      .map(cellText)
      .join(" ");
    const rowTime = timeRangeIn(timeText);

    const buckets = columns.map<OcrWord[]>(() => []);
    cells.forEach((cell) => {
      const left = cell[0]?.left ?? 0;
      if (left < timeLimit) return;
      const bucket = bucketFor(left, boundaries);
      if (bucket < buckets.length && buckets[bucket]) buckets[bucket]!.push(...cell);
    });

    buckets.forEach((bucket, columnIndex) => {
      if (bucket.length === 0) return;
      const text = cellText(bucket);
      if (!text) return;
      const time = rowTime ?? timeRangeIn(text);
      if (!time) return;
      const day = columns[columnIndex]?.day;
      if (day === undefined) return;
      out.push(`${WEEKDAY_LABEL[day]} ${time} ${text}`);
    });
  });

  return out.length > 0 ? out.join("\n") : null;
}

function splitTransposedGrid(groups: OcrWord[][]): string | null {
  // Header row made of time slots, with day names down the first column.
  let headerIndex = -1;
  let slotRanges: Array<{ time: string; left: number }> = [];

  groups.forEach((words, index) => {
    const cells = splitIntoCells(words);
    const ranges: Array<{ time: string; left: number }> = [];
    const starts: Array<{ clock: string; left: number }> = [];

    cells.forEach((cell) => {
      const text = cellText(cell);
      const left = cell[0]?.left ?? 0;
      const timing = cellTime(text);
      if (timing?.range) ranges.push({ time: timing.range, left });
      else if (timing?.clock) starts.push({ clock: timing.clock, left });
    });

    if (ranges.length + starts.length < 2) return;
    if (ranges.length >= 2) {
      slotRanges = ranges;
      headerIndex = index;
    } else if (starts.length >= 2) {
      const ordered = [...starts].sort((a, b) => a.left - b.left);
      slotRanges = ordered.map((slot, slotIndex) => {
        const next = ordered[slotIndex + 1]?.clock ?? minutesToTime(timeToMinutes(slot.clock) + 60);
        return { time: `${slot.clock}-${next}`, left: slot.left };
      });
      headerIndex = index;
    }
  });

  if (headerIndex < 0 || slotRanges.length < 2) return null;

  const orderedSlots = [...slotRanges].sort((a, b) => a.left - b.left);
  const lefts = orderedSlots.map((slot) => slot.left);
  const boundaries = lefts.slice(1).map((left, index) => ((lefts[index] ?? left) + left) / 2);
  const firstEdge = (lefts[0] ?? 0) - ((lefts[1] ?? 0) - (lefts[0] ?? 0)) / 2;

  const out: string[] = [];
  groups.forEach((words, index) => {
    if (index <= headerIndex) return;
    const dayWord = words
      .filter((word) => word.left < firstEdge)
      .find((word) => parseWeekday(word.text.replace(/[^A-Za-z]/g, "")) !== null);
    if (!dayWord) return;
    const day = parseWeekday(dayWord.text.replace(/[^A-Za-z]/g, ""));
    if (day === null) return;

    const buckets = orderedSlots.map<OcrWord[]>(() => []);
    splitIntoCells(words).forEach((cell) => {
      const left = cell[0]?.left ?? 0;
      if (left < firstEdge) return;
      const bucket = bucketFor(left, boundaries);
      if (bucket < buckets.length && buckets[bucket]) buckets[bucket]!.push(...cell);
    });

    buckets.forEach((bucket, slotIndex) => {
      if (bucket.length === 0) return;
      const text = cellText(bucket);
      const time = orderedSlots[slotIndex]?.time;
      if (!text || !time) return;
      out.push(`${WEEKDAY_LABEL[day]} ${time} ${text}`);
    });
  });

  return out.length > 0 ? out.join("\n") : null;
}

/**
 * Turns Tesseract TSV into timetable-shaped text. Grid layouts need the word
 * coordinates: plain OCR reads across the whole row, which mixes days and
 * rooms. This rebuilds one line per table cell instead.
 */
export function reconstructTimetableFromTsv(tsv: string): string {
  const groups = parseOcrTsv(tsv);
  if (groups.length === 0) return "";
  return splitDaysAndGrid(groups) ?? splitTransposedGrid(groups) ?? "";
}

function bestOcrText(candidates: string[]): string {
  const unique = [
    ...new Set(candidates.map((candidate) => tidyOcrText(candidate)).filter(Boolean)),
  ];
  if (unique.length === 0) return "";
  let best = unique[0] ?? "";
  let bestScore = -1;
  unique.forEach((candidate) => {
    const parsed = parseTimetable(candidate).entries.length;
    // A rebuilt grid is worth a small bonus: its rows line up with the photo.
    const score =
      parsed * 100 + timetableSignalScore(candidate) + (candidate.includes("\n") ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best;
}

async function ocrImage(
  image: Blob | HTMLCanvasElement,
  onProgress: ((value: ExtractProgress) => void) | undefined,
): Promise<string> {
  report(onProgress, "Preparing the photo…", 0.01);
  const prepared = await prepareForOcr(image);
  report(onProgress, "Loading text recognition engine…", 0.05);
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (message) => {
      report(
        onProgress,
        message.status === "recognizing text" ? "Reading the timetable…" : message.status,
        0.1 + message.progress * 0.8,
      );
    },
  });

  try {
    const passes = [
      { canvas: prepared.grayscale, mode: PSM.AUTO, label: "Reading the timetable…" },
      { canvas: prepared.binary, mode: PSM.SPARSE_TEXT, label: "Trying a clearer OCR pass…" },
    ] as const;
    let best = "";

    for (const [index, pass] of passes.entries()) {
      // A rebuilt grid with real day + time + room rows is a strong signal.
      // Only spend time on another pass when the first one was weak.
      if (index > 0 && parseTimetable(best).entries.length > 0) break;
      report(onProgress, pass.label, 0.15 + index * 0.35);
      await worker.setParameters({
        tessedit_pageseg_mode: pass.mode,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      const result = await worker.recognize(pass.canvas, {}, { text: true, tsv: true });
      const plain = result.data.text ?? "";
      const tsv = result.data.tsv ?? "";
      const groups = tsv ? parseOcrTsv(tsv) : [];
      const layout = groups.length > 0 ? ocrLinesToLayoutText(groups) : "";
      const grid = tsv ? reconstructTimetableFromTsv(tsv) : "";
      const text = bestOcrText([plain, layout, grid]);
      if (!best || parseTimetable(text).entries.length >= parseTimetable(best).entries.length) {
        best = text;
      }
    }

    return best;
  } finally {
    await worker.terminate();
  }
}

/**
 * Turns an uploaded timetable file into text.
 *
 * CSV/ICS/TXT are read directly. PDFs use their embedded text when it looks
 * like a timetable. Photos and scanned image-only PDFs go through OCR in the
 * browser, with contrast stretching and a second pass for difficult photos.
 */
export async function extractTimetableFile(
  file: File,
  onProgress?: (value: ExtractProgress) => void,
): Promise<ExtractTimetableResult> {
  const extension = extensionOf(file);
  if (
    extension === "csv" ||
    extension === "ics" ||
    extension === "txt" ||
    file.type.startsWith("text/")
  ) {
    report(onProgress, "Reading file…", 0.4);
    return { text: await file.text(), source: "text" };
  }

  if (isPdf(file)) {
    report(onProgress, "Reading PDF…", 0.15);
    const text = await extractPdfText(file);
    if (looksLikeTimetable(text)) {
      report(onProgress, "PDF text extracted", 1);
      return { text, source: "pdf" };
    }

    const ocrText = await ocrImage(await renderPdfFirstPages(file), onProgress);
    if (timetableSignalScore(ocrText) > timetableSignalScore(text)) {
      return {
        text: ocrText,
        source: "pdf",
        warning:
          "This PDF had little selectable text, so the pages were read with OCR. Check the extracted rows.",
      };
    }
    if (text.trim()) {
      report(onProgress, "PDF text extracted", 1);
      return {
        text,
        source: "pdf",
        warning:
          "OCR didn't find a clearer timetable than the PDF text. Check the extracted rows before applying.",
      };
    }
    return {
      text: ocrText,
      source: "pdf",
      warning: "This PDF looked like a scan, so the text was recognised with OCR.",
    };
  }

  if (isImage(file)) {
    const text = await ocrImage(file, onProgress);
    return {
      text,
      source: "image",
      warning:
        "Photo text can be imperfect. Check the extracted rows before relying on them — unknown rooms are skipped automatically.",
    };
  }

  throw new Error("Choose a CSV, ICS, TXT, PDF, PNG or JPG timetable.");
}

/** Renders PDF pages into one tall canvas so scanned PDFs can be OCR'd. */
async function renderPdfFirstPages(file: File): Promise<HTMLCanvasElement> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageCount = Math.min(pdf.numPages, 3);
  const pages: HTMLCanvasElement[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    // Render around 2,000 px wide: enough detail for small timetable text.
    const scale = Math.min(3.2, Math.max(2, 2200 / Math.max(1, base.width)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the PDF page for reading.");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pages.push(canvas);
  }

  if (pages.length === 1) return pages[0]!;
  const width = Math.max(...pages.map((page) => page.width));
  const height = pages.reduce((total, page) => total + page.height, 0);
  const combined = document.createElement("canvas");
  combined.width = width;
  combined.height = height;
  const context = combined.getContext("2d");
  if (!context) throw new Error("Could not combine the PDF pages.");
  let y = 0;
  pages.forEach((page) => {
    context.drawImage(page, 0, y);
    y += page.height;
  });
  return combined;
}
