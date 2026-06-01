#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  performanceMetricsPath,
  projectPath,
  reportDir,
} = require("./test-utils.cjs");

const generatedAt = new Date();

function relative(filePath) {
  return path.relative(projectPath(), filePath).replace(/\\/g, "/");
}

function listTestFiles() {
  return fs
    .readdirSync(__dirname)
    .filter((file) => file.endsWith(".test.cjs"))
    .sort()
    .map((file) => path.join(__dirname, file));
}

function runTests(testFiles) {
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...testFiles], {
    cwd: projectPath(),
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    status: result.status === null ? 1 : result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function parseTap(output) {
  const lines = String(output || "").split(/\r?\n/);
  const tests = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(/^(ok|not ok)\s+\d+\s+-\s+(.+)$/);
    if (match) {
      current = {
        name: match[2].trim(),
        type: inferType(match[2]),
        status: match[1] === "ok" ? "passed" : "failed",
        durationMs: 0,
      };
      tests.push(current);
      continue;
    }

    if (current) {
      const duration = line.match(/duration_ms:\s*([0-9.]+)/);
      if (duration) {
        current.durationMs = Number(duration[1]);
      }
    }
  }

  return tests.filter((item) => item.type !== "Other");
}

function inferType(name) {
  if (/^\[Functional\]/.test(name)) return "Functional Testing";
  if (/^\[Performance\]/.test(name)) return "Performance Testing";
  if (/^\[Error Handling\]/.test(name)) return "Error Handling Testing";
  return "Other";
}

function summarize(items) {
  const total = items.length;
  const passed = items.filter((item) => item.status === "passed").length;
  const failed = total - passed;
  return {
    total,
    passed,
    failed,
    passRate: total ? Math.round((passed / total) * 1000) / 10 : 0,
  };
}

function groupByType(tests) {
  const types = ["Functional Testing", "Performance Testing", "Error Handling Testing"];
  return types.map((type) => ({
    type,
    ...summarize(tests.filter((item) => item.type === type)),
  }));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readPerformanceMetrics() {
  if (!fs.existsSync(performanceMetricsPath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(performanceMetricsPath, "utf8"));
  } catch (error) {
    return [];
  }
}

function renderBar(value, total, color) {
  const width = total ? Math.round((value / total) * 100) : 0;
  return `<div class="bar"><span style="width:${width}%;background:${color}"></span></div>`;
}

function renderHtml(report) {
  const typeRows = report.byType.map((item) => `
    <tr>
      <td>${escapeHtml(item.type)}</td>
      <td>${item.total}</td>
      <td>${item.passed}</td>
      <td>${item.failed}</td>
      <td>${item.passRate}%</td>
      <td>${renderBar(item.passed, item.total, item.failed ? "#dc2626" : "#16a34a")}</td>
    </tr>
  `).join("");

  const testRows = report.tests.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.name.replace(/^\[[^\]]+\]\s*/, ""))}</td>
      <td><span class="pill ${item.status}">${item.status}</span></td>
      <td>${item.durationMs.toFixed(2)} ms</td>
    </tr>
  `).join("");

  const maxMetric = Math.max(1, ...report.performanceMetrics.map((item) => Math.max(item.durationMs, item.thresholdMs)));
  const performanceRows = report.performanceMetrics.map((item) => {
    const durationWidth = Math.max(2, Math.round((item.durationMs / maxMetric) * 100));
    const thresholdWidth = Math.max(2, Math.round((item.thresholdMs / maxMetric) * 100));
    return `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.durationMs.toFixed(2)} ms</td>
        <td>${item.thresholdMs.toFixed(2)} ms</td>
        <td><span class="pill ${item.passed ? "passed" : "failed"}">${item.passed ? "passed" : "failed"}</span></td>
        <td>
          <div class="metric-bar"><span class="duration" style="width:${durationWidth}%"></span><i style="left:${thresholdWidth}%"></i></div>
        </td>
      </tr>
    `;
  }).join("");

  const status = report.summary.failed === 0 ? "PASS" : "FAIL";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI-EMS System Evaluation Test Report</title>
  <style>
    :root {
      --bg: #f6f7fb;
      --panel: #ffffff;
      --ink: #172033;
      --muted: #687386;
      --line: #dce2ea;
      --green: #16a34a;
      --red: #dc2626;
      --blue: #2563eb;
      --amber: #d97706;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: Arial, "Segoe UI", sans-serif; }
    main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 30px 0 46px; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; }
    h2 { margin: 0 0 14px; font-size: 19px; }
    p { margin: 0; color: var(--muted); line-height: 1.55; }
    code { padding: 2px 6px; border-radius: 5px; background: #e9eef6; }
    .status { min-width: 88px; text-align: center; padding: 10px 14px; border-radius: 8px; font-weight: 800; color: ${status === "PASS" ? "#166534" : "#991b1b"}; background: ${status === "PASS" ? "#dcfce7" : "#fee2e2"}; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 18px 0; }
    .card, section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .label { color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: .04em; }
    .value { margin-top: 7px; font-size: 30px; font-weight: 850; }
    section { margin-top: 16px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 11px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
    th { background: #f8fafc; color: #334155; font-size: 13px; }
    .pill { display: inline-flex; justify-content: center; min-width: 72px; padding: 4px 9px; border-radius: 999px; font-size: 12px; font-weight: 800; }
    .passed { color: #166534; background: #dcfce7; }
    .failed { color: #991b1b; background: #fee2e2; }
    .bar, .metric-bar { width: 100%; min-width: 180px; height: 13px; border-radius: 999px; background: #e2e8f0; overflow: hidden; position: relative; }
    .bar span, .metric-bar span { display: block; height: 100%; border-radius: inherit; }
    .metric-bar .duration { background: var(--blue); }
    .metric-bar i { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--amber); }
    @media (max-width: 820px) { header { flex-direction: column; } .cards { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 560px) { .cards { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>AI-EMS System Evaluation Test Report</h1>
        <p>Generated at ${escapeHtml(report.generatedAt)}. Run command: <code>npm run test:system</code></p>
      </div>
      <div class="status">${status}</div>
    </header>

    <div class="cards">
      <div class="card"><div class="label">Total Tests</div><div class="value">${report.summary.total}</div><p>${report.summary.passed} passed, ${report.summary.failed} failed</p></div>
      <div class="card"><div class="label">Pass Rate</div><div class="value">${report.summary.passRate}%</div>${renderBar(report.summary.passed, report.summary.total, "#16a34a")}</div>
      <div class="card"><div class="label">Functional</div><div class="value">${report.byType[0].passRate}%</div><p>${report.byType[0].passed}/${report.byType[0].total} passed</p></div>
      <div class="card"><div class="label">Performance</div><div class="value">${report.byType[1].passRate}%</div><p>${report.byType[1].passed}/${report.byType[1].total} passed</p></div>
    </div>

    <section>
      <h2>Result Visualization by Test Type</h2>
      <table>
        <thead><tr><th>Test type</th><th>Total</th><th>Passed</th><th>Failed</th><th>Pass rate</th><th>Visual</th></tr></thead>
        <tbody>${typeRows}</tbody>
      </table>
    </section>

    <section>
      <h2>Performance Visualization</h2>
      <table>
        <thead><tr><th>Metric</th><th>Duration</th><th>Budget</th><th>Status</th><th>Duration bar / budget marker</th></tr></thead>
        <tbody>${performanceRows || '<tr><td colspan="5">No performance metrics were recorded.</td></tr>'}</tbody>
      </table>
    </section>

    <section>
      <h2>Test Cases</h2>
      <table>
        <thead><tr><th>#</th><th>Type</th><th>Case</th><th>Status</th><th>Duration</th></tr></thead>
        <tbody>${testRows}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function renderMarkdown(report) {
  return [
    "# AI-EMS System Evaluation Test Summary",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "| Test type | Total | Passed | Failed | Pass rate |",
    "|---|---:|---:|---:|---:|",
    ...report.byType.map((item) => `| ${item.type} | ${item.total} | ${item.passed} | ${item.failed} | ${item.passRate}% |`),
    "",
    `HTML visualization: ${relative(path.join(reportDir, "system-evaluation-report.html"))}`,
    `JSON data: ${relative(path.join(reportDir, "system-evaluation-results.json"))}`,
  ].join("\n");
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true });
  if (fs.existsSync(performanceMetricsPath)) {
    fs.unlinkSync(performanceMetricsPath);
  }

  const testFiles = listTestFiles();
  const run = runTests(testFiles);
  const tests = parseTap(`${run.stdout}\n${run.stderr}`);
  const summary = summarize(tests);
  const report = {
    generatedAt: generatedAt.toISOString(),
    summary,
    byType: groupByType(tests),
    tests,
    performanceMetrics: readPerformanceMetrics(),
    raw: {
      stdout: run.stdout,
      stderr: run.stderr,
    },
  };

  fs.writeFileSync(path.join(reportDir, "system-evaluation-results.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportDir, "system-evaluation-report.html"), renderHtml(report));
  fs.writeFileSync(path.join(reportDir, "system-evaluation-summary.md"), renderMarkdown(report));

  console.log(`System evaluation visualization: ${relative(path.join(reportDir, "system-evaluation-report.html"))}`);
  console.log(`Tests passed: ${summary.passed}/${summary.total}`);

  if (run.status !== 0 || summary.failed > 0) {
    process.exitCode = 1;
  }
}

main();
