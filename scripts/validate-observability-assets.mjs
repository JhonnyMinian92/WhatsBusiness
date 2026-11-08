import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readRepositoryFile = (path) => readFile(resolve(repositoryRoot, path), "utf8");

const dashboardPath = "microservices-meta-ecuapp/observability/grafana/tenant-job-runtime.dashboard.json";
const alertRulesPath = "microservices-meta-ecuapp/observability/prometheus/tenant-job-alerts.yml";
const exporterPath = "microservices-meta-ecuapp/src/jobs/infrastructure/metrics/prometheus-tenant-job-runtime-metrics.ts";

const [dashboardSource, alertRulesSource, exporterSource] = await Promise.all([
  readRepositoryFile(dashboardPath),
  readRepositoryFile(alertRulesPath),
  readRepositoryFile(exporterPath),
]);

const dashboard = JSON.parse(dashboardSource);
assert.equal(typeof dashboard.uid, "string", "Grafana dashboard must have a stable UID.");
assert.ok(Array.isArray(dashboard.panels) && dashboard.panels.length > 0,
  "Grafana dashboard must define at least one panel.");

const panelIds = new Set();
const dashboardExpressions = [];
for (const panel of dashboard.panels) {
  assert.ok(Number.isSafeInteger(panel.id) && panel.id > 0, "Every Grafana panel must have a positive integer ID.");
  assert.ok(!panelIds.has(panel.id), "Grafana panel IDs must be unique: " + panel.id);
  panelIds.add(panel.id);
  assert.ok(Array.isArray(panel.targets) && panel.targets.length > 0,
    "Every Grafana panel must define at least one Prometheus target: " + panel.title);
  for (const target of panel.targets) {
    assert.equal(typeof target.expr, "string", "Every dashboard target must define a PromQL expression.");
    assert.ok(target.expr.trim().length > 0, "Dashboard PromQL expressions cannot be empty.");
    dashboardExpressions.push(target.expr);
  }
}

const registeredMetrics = new Set(
  [...exporterSource.matchAll(/["\'](tenant_job_[a-zA-Z0-9_]+)["\']/g)].map((match) => match[1]),
);
assert.ok(registeredMetrics.size > 0, "The Prometheus exporter must register runtime metrics.");
// Histogram exposition expands each registered base name into _bucket, _sum and _count series.
for (const histogram of ["tenant_job_execution_duration_seconds", "tenant_job_publish_duration_seconds"]) {
  assert.ok(registeredMetrics.has(histogram), "Histogram base metric is missing: " + histogram);
  registeredMetrics.add(histogram + "_bucket");
  registeredMetrics.add(histogram + "_sum");
  registeredMetrics.add(histogram + "_count");
}

const validateMetricReferences = (expression, sourceLabel) => {
  const referencedMetrics = [...expression.matchAll(/\b(tenant_job_[a-z0-9_]+|up)\b/g)]
    .map((match) => match[1])
    .filter((metric) => metric !== "up");
  for (const metric of referencedMetrics) {
    assert.ok(registeredMetrics.has(metric),
      sourceLabel + " references a metric not registered by the exporter: " + metric);
  }
};
for (const expression of dashboardExpressions) validateMetricReferences(expression, "Grafana dashboard");

const alertNames = new Set();
const alertRules = [];
let currentRule = null;
for (const line of alertRulesSource.split(/\r?\n/)) {
  const alertMatch = /^      - alert: ([A-Za-z][A-Za-z0-9_]+)$/.exec(line);
  if (alertMatch) {
    currentRule = { name: alertMatch[1], expression: null, duration: null, severity: null, summary: null, description: null };
    alertRules.push(currentRule);
    assert.ok(!alertNames.has(currentRule.name), "Prometheus alert names must be unique: " + currentRule.name);
    alertNames.add(currentRule.name);
    continue;
  }
  if (!currentRule) continue;
  const expression = /^        expr: (.+)$/.exec(line);
  if (expression) currentRule.expression = expression[1].trim();
  const duration = /^        for: ([0-9]+[smhd])$/.exec(line);
  if (duration) currentRule.duration = duration[1];
  const severity = /^          severity: (critical|warning|info)$/.exec(line);
  if (severity) currentRule.severity = severity[1];
  const summary = /^          summary: "(.+)"$/.exec(line);
  if (summary) currentRule.summary = summary[1];
  const description = /^          description: "(.+)"$/.exec(line);
  if (description) currentRule.description = description[1];
}
assert.ok(alertRules.length > 0, "Prometheus alert rules must not be empty.");
for (const rule of alertRules) {
  assert.ok(rule.expression, "Alert must define expr: " + rule.name);
  assert.ok(rule.duration, "Alert must define for: " + rule.name);
  assert.ok(rule.severity, "Alert must define severity: " + rule.name);
  assert.ok(rule.summary, "Alert must define summary: " + rule.name);
  assert.ok(rule.description, "Alert must define description: " + rule.name);
  validateMetricReferences(rule.expression, "Prometheus alert " + rule.name);
}

assert.ok(dashboardExpressions.some((expression) => expression.includes("tenant_job_execution_pending")),
  "Dashboard must expose the durable execution backlog count.");
assert.ok(dashboardExpressions.some((expression) => expression.includes("tenant_job_oldest_pending_execution_age_seconds")),
  "Dashboard must expose the durable execution backlog age.");
assert.ok(alertRules.some((rule) => rule.expression.includes("tenant_job_execution_pending")),
  "Prometheus rules must alert on durable execution backlog count.");
assert.ok(alertRules.some((rule) => rule.expression.includes("tenant_job_oldest_pending_execution_age_seconds")),
  "Prometheus rules must alert on durable execution backlog age.");

console.log("Observability assets validated: " + dashboard.panels.length + " Grafana panels, "
  + alertRules.length + " Prometheus alert rules, " + registeredMetrics.size + " registered metric series.");
