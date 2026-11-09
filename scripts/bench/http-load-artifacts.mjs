import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatBenchmarkMarkdown } from "./http-load-runner.mjs";

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function fileStamp(isoDate) {
  return isoDate.replaceAll(":", "-").replaceAll(".", "-");
}

export async function writeBenchmarkArtifacts({ summary, results }, outputDirectory) {
  const absoluteDirectory = path.resolve(process.cwd(), outputDirectory);
  await mkdir(absoluteDirectory, { recursive: true });

  const prefix = `${summary.scenarioId}-${fileStamp(summary.startedAt)}`;
  const jsonPath = path.join(absoluteDirectory, `${prefix}.json`);
  const markdownPath = path.join(absoluteDirectory, `${prefix}.md`);
  const csvPath = path.join(absoluteDirectory, `${prefix}.csv`);

  const json = JSON.stringify(summary, null, 2) + "\n";
  const csv = [
    "sequence,elapsed_ms,status,error_code",
    ...results.map((result) => [
      result.sequence,
      result.elapsedMs,
      result.status,
      result.errorCode,
    ].map(csvCell).join(",")),
    "",
  ].join("\n");

  await Promise.all([
    writeFile(jsonPath, json, { encoding: "utf8", flag: "wx" }),
    writeFile(markdownPath, formatBenchmarkMarkdown(summary), { encoding: "utf8", flag: "wx" }),
    writeFile(csvPath, csv, { encoding: "utf8", flag: "wx" }),
  ]);

  return Object.freeze({ jsonPath, markdownPath, csvPath });
}
