import { describe, expect, it } from "vitest";
import {
  ocrLinesToLayoutText,
  parseOcrTsv,
  reconstructTimetableFromTsv,
} from "@/lib/timetable-import";
import { parseTimetable } from "@/lib/timetable";

let lineNumber = 0;

function word(text: string, left: number, top: number, width = 60): string {
  return [
    "5",
    "1",
    "1",
    "1",
    String(lineNumber),
    "1",
    String(left),
    String(top),
    String(width),
    "20",
    "96",
    text,
  ].join("\t");
}

function row(top: number, cells: Array<[string, number]>): string {
  lineNumber += 1;
  return cells
    .map(([text, left]) => word(text, left, top, Math.max(40, text.length * 12)))
    .join("\n");
}

const HEADER = [
  "level",
  "page_num",
  "block_num",
  "par_num",
  "line_num",
  "word_num",
  "left",
  "top",
  "width",
  "height",
  "conf",
  "text",
].join("\t");

describe("OCR TSV reconstruction", () => {
  it("rebuilds day-column grids into one line per cell", () => {
    lineNumber = 0;
    const tsv = [
      HEADER,
      row(80, [
        ["Time", 20],
        ["Monday", 260],
        ["Tuesday", 560],
        ["Wednesday", 860],
      ]),
      row(200, [
        ["09:00-10:00", 20],
        ["Data", 260],
        ["Structures", 340],
        ["CSED-201", 410],
        ["Physics", 560],
        ["CSED-202", 650],
        ["Chemistry", 860],
        ["CSED-203", 1000],
      ]),
      row(300, [
        ["10:00-11:00", 20],
        ["DBMS", 260],
        ["CSED-204", 350],
      ]),
    ].join("\n");

    const groups = parseOcrTsv(tsv);
    expect(groups.length).toBe(3);

    const text = reconstructTimetableFromTsv(tsv);
    expect(text).toContain("Monday 09:00-10:00");
    expect(text).toContain("Tuesday 09:00-10:00");
    expect(text).toContain("Wednesday 09:00-10:00");

    const parsed = parseTimetable(text);
    expect(parsed.entries.map((entry) => entry.room)).toEqual(
      expect.arrayContaining(["CSED-201", "CSED-202", "CSED-203", "CSED-204"]),
    );
    expect(parsed.entries.find((entry) => entry.room === "CSED-202")?.day).toBe(2);
    expect(parsed.entries.find((entry) => entry.room === "CSED-204")?.start).toBe("10:00");
  });

  it("rebuilds transposed grids where days are rows and times are columns", () => {
    lineNumber = 0;
    const tsv = [
      HEADER,
      row(80, [
        ["Day", 20],
        ["09:00-10:00", 260],
        ["10:00-11:00", 620],
        ["11:00-12:00", 980],
      ]),
      row(200, [
        ["Monday", 20],
        ["Maths", 260],
        ["CSED-101", 380],
        ["Physics", 620],
        ["CSED-102", 740],
      ]),
      row(300, [
        ["Tuesday", 20],
        ["Chemistry", 620],
        ["CSED-103", 740],
      ]),
    ].join("\n");

    const text = reconstructTimetableFromTsv(tsv);
    const parsed = parseTimetable(text);
    expect(parsed.entries.find((entry) => entry.room === "CSED-101")).toMatchObject({
      day: 1,
      start: "09:00",
      end: "10:00",
    });
    expect(parsed.entries.find((entry) => entry.room === "CSED-103")).toMatchObject({
      day: 2,
      start: "10:00",
    });
  });

  it("falls back to layout text when there is no grid header", () => {
    lineNumber = 0;
    const tsv = [
      HEADER,
      row(80, [
        ["Monday", 20],
        ["09:00-10:00", 200],
        ["Data Structures", 400],
        ["CSED-201", 700],
      ]),
    ].join("\n");

    expect(reconstructTimetableFromTsv(tsv)).toBe("");
    const layout = ocrLinesToLayoutText(parseOcrTsv(tsv));
    expect(layout).toContain("Monday");
    expect(layout).toContain("CSED-201");
    expect(parseTimetable(layout).entries[0]).toMatchObject({
      day: 1,
      room: "CSED-201",
    });
  });

  it("infers end times when a header only has start times", () => {
    lineNumber = 0;
    const tsv = [
      HEADER,
      row(80, [
        ["Day", 20],
        ["9:00", 260],
        ["10:00", 620],
      ]),
      row(200, [
        ["Monday", 20],
        ["Maths", 260],
        ["CSED-101", 380],
        ["Physics", 620],
        ["CSED-102", 740],
      ]),
    ].join("\n");

    const parsed = parseTimetable(reconstructTimetableFromTsv(tsv));
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]).toMatchObject({ start: "09:00", end: "10:00" });
    expect(parsed.entries[1]).toMatchObject({ start: "10:00", end: "11:00" });
  });
});
