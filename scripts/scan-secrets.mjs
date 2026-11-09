#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

const SCANNABLE_EXTENSIONS = new Set([
  ".cjs",".css",".env",".example",".go",".graphql",".html",".ini",".java",
  ".js",".json",".jsx",".md",".mjs",".php",".properties",".py",".rb",
  ".sh",".sql",".svg",".toml",".ts",".tsx",".txt",".xml",".yaml",".yml",
]);
const ALLOWED_ENV_TEMPLATES = new Set([".env.example",".env.sample",".env.template"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const DETECTORS = [
  { name: "private-key", pattern: /-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "slack-token", pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: "stripe-live-secret", pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { name: "telegram-bot-token", pattern: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
];

function listTrackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function isScannable(path) {
  if (path === "pnpm-lock.yaml") return false;
  const name = basename(path);
  if (name.startsWith(".env") && !ALLOWED_ENV_TEMPLATES.has(name)) return true;
  return SCANNABLE_EXTENSIONS.has(extname(path).toLowerCase());
}

function scanFile(path) {
  const stats = statSync(path);
  if (stats.size > MAX_FILE_BYTES) return [];
  const bytes = readFileSync(path);
  if (bytes.includes(0)) return [];
  const text = bytes.toString("utf8");
  const findings = [];

  const name = basename(path);
  if (name.startsWith(".env") && !ALLOWED_ENV_TEMPLATES.has(name)) {
    findings.push({ path, detector: "tracked-environment-file" });
  }

  for (const detector of DETECTORS) {
    if (detector.pattern.test(text)) {
      // The report intentionally never prints matched text or source lines.
      // Common public AWS example keys are not credentials.
      if (detector.name === "aws-access-key" && /AKIAIOSFODNN7EXAMPLE|ASIAIOSFODNN7EXAMPLE/.test(text)) continue;
      findings.push({ path, detector: detector.name });
    }
  }
  return findings;
}

function main() {
  let files;
  try {
    files = listTrackedFiles().filter(isScannable);
  } catch {
    process.stderr.write("Secret scan requires a git checkout with tracked source files.\n");
    process.exitCode = 2;
    return;
  }

  const findings = files.flatMap((path) => {
    try {
      return scanFile(path);
    } catch {
      process.stderr.write(`Unable to read tracked file: ${path}\n`);
      process.exitCode = 2;
      return [];
    }
  });

  if (findings.length > 0) {
    process.stderr.write("Potential credential exposure detected (matched values are redacted):\n");
    for (const finding of findings) {
      process.stderr.write(` - ${finding.path}: ${finding.detector}\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Secret scan passed: ${files.length} tracked text files checked; no high-confidence credential patterns found.\n`);
}

main();
