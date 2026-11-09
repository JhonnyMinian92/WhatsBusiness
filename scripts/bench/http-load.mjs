#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeBenchmarkConfig } from "./http-load-config.mjs";
import { runHttpBenchmark } from "./http-load-runner.mjs";
import { writeBenchmarkArtifacts } from "./http-load-artifacts.mjs";

function parseArguments(args) {
  const options = { configPath: null, allowExternalTarget: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") return { ...options, help: true };
    if (argument === "--allow-external-target") {
      options.allowExternalTarget = true;
      continue;
    }
    if (argument === "--config" && args[index + 1]) {
      options.configPath = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "WhatsBusiness read-only HTTP benchmark",
    "",
    "Usage:",
    "  node scripts/bench/http-load.mjs --config scripts/bench/http-load.config.example.json",
    "",
    "Options:",
    "  --config <file>          JSON workload configuration (required)",
    "  --allow-external-target  explicitly allow HTTPS non-loopback dev/test/staging targets",
    "  --help                   show this message",
    "",
    "Only GET is supported. Production targets are prohibited.",
    "",
  ].join("\n"));
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.configPath) {
    printHelp();
    throw new Error("--config is required.");
  }

  const configPath = path.resolve(process.cwd(), args.configPath);
  const raw = JSON.parse(await readFile(configPath, "utf8"));
  const config = normalizeBenchmarkConfig(raw, { allowExternalTarget: args.allowExternalTarget });
  const result = await runHttpBenchmark(config);
  const artifacts = await writeBenchmarkArtifacts(result, config.outputDirectory);

  const metrics = result.summary.metrics;
  process.stdout.write([
    `Scenario: ${result.summary.scenarioId}`,
    `Target: ${result.summary.target.method} ${result.summary.target.url}`,
    `Requests: ${metrics.requestCount}; success: ${metrics.successCount}; errors: ${metrics.errorCount}`,
    `Throughput: ${metrics.throughputPerSecond ?? "n/a"} requests/s`,
    `Latency p50/p95/p99: ${metrics.latency.p50Ms ?? "n/a"} / ${metrics.latency.p95Ms ?? "n/a"} / ${metrics.latency.p99Ms ?? "n/a"} ms`,
    `JSON report: ${artifacts.jsonPath}`,
    `Markdown report: ${artifacts.markdownPath}`,
    `CSV samples: ${artifacts.csvPath}`,
    result.summary.thresholds.configured
      ? (result.summary.thresholds.met ? "Configured thresholds: met" : `Configured thresholds: FAILED (${result.summary.thresholds.violations.join("; ")})`)
      : "No SLO thresholds configured: results are informational.",
    "",
  ].join("\n"));

  if (metrics.errorCount > 0 || (result.summary.thresholds.configured && !result.summary.thresholds.met)) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`Benchmark failed: ${error instanceof Error ? error.message : "unexpected error"}\n`);
    process.exitCode = 1;
  });
}
