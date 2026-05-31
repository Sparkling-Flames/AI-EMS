#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const reportDir = path.join(root, 'tests', 'reports');
const generatedAt = new Date();

function relative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function listFiles(dir, predicate, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(fullPath, predicate, output);
    } else if (predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output.sort();
}

function runCommand(command, args) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status === null ? 1 : result.status,
    durationMs: Date.now() - startedAt,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function parseTap(output) {
  const lines = String(output || '').split(/\r?\n/);
  const tests = [];
  let current = null;

  for (const line of lines) {
    const testMatch = line.match(/^(ok|not ok)\s+\d+\s+-\s+(.+)$/);
    if (testMatch) {
      current = {
        name: testMatch[2].trim(),
        status: testMatch[1] === 'ok' ? 'passed' : 'failed',
        durationMs: 0,
      };
      tests.push(current);
      continue;
    }

    if (current) {
      const durationMatch = line.match(/duration_ms:\s*([0-9.]+)/);
      if (durationMatch) {
        current.durationMs = Number(durationMatch[1]);
      }
    }
  }

  return tests.map((item) => ({
    ...item,
    category: categorizeTest(item.name),
  }));
}

function categorizeTest(name) {
  const value = String(name || '').toLowerCase();
  if (/evaluation|feedback|score|anonymous/.test(value)) return 'Course Evaluation';
  if (/assistant|ai history|roster|knowledge/.test(value)) return 'AI Assistant';
  if (/dashboard|profile/.test(value)) return 'Dashboard & Profile';
  if (/leave|attendance/.test(value)) return 'Leave & Attendance';
  if (/material|file/.test(value)) return 'Course Materials';
  if (/admin|course/.test(value)) return 'Admin Management';
  if (/frontend|ui|student materials/.test(value)) return 'Frontend UI';
  return 'Core Workflow';
}

function summarize(items) {
  const total = items.length;
  const passed = items.filter((item) => item.status === 'passed').length;
  const failed = items.filter((item) => item.status === 'failed').length;
  return { total, passed, failed, passRate: total ? Math.round((passed / total) * 1000) / 10 : 0 };
}

function groupByCategory(tests) {
  const map = new Map();
  for (const testCase of tests) {
    if (!map.has(testCase.category)) {
      map.set(testCase.category, []);
    }
    map.get(testCase.category).push(testCase);
  }
  return Array.from(map.entries())
    .map(([category, items]) => ({ category, ...summarize(items) }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBar(value, total, color) {
  const width = total ? Math.max(3, Math.round((value / total) * 100)) : 0;
  return `<div class="bar"><span style="width:${width}%;background:${color}"></span></div>`;
}

function renderHtml(report) {
  const testSummary = report.summary.tests;
  const syntaxSummary = report.summary.syntaxChecks;
  const overallOk = report.summary.failed === 0;
  const categoryRows = report.categories.map((item) => `
    <tr>
      <td>${escapeHtml(item.category)}</td>
      <td>${item.total}</td>
      <td>${item.passed}</td>
      <td>${item.failed}</td>
      <td>${renderBar(item.passed, item.total, '#16a34a')}</td>
    </tr>
  `).join('');
  const testRows = report.tests.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td><span class="pill ${item.status}">${item.status}</span></td>
      <td>${item.durationMs.toFixed(1)} ms</td>
    </tr>
  `).join('');
  const syntaxRows = report.syntaxChecks.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.file)}</td>
      <td><span class="pill ${item.status}">${item.status}</span></td>
      <td>${item.durationMs} ms</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI-EMS System Evaluation Report</title>
  <style>
    :root { color-scheme: light; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --blue:#2563eb; --green:#16a34a; --red:#dc2626; --bg:#f8fafc; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: #eef2f7; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 48px; }
    header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 22px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    h2 { margin: 0 0 14px; font-size: 20px; }
    p { margin: 0; color: var(--muted); line-height: 1.55; }
    .status { padding: 10px 14px; border-radius: 8px; font-weight: 700; background: ${overallOk ? '#dcfce7' : '#fee2e2'}; color: ${overallOk ? '#166534' : '#991b1b'}; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 20px 0; }
    .card, section { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .metric { font-size: 30px; font-weight: 800; margin-top: 8px; }
    .metric-label { color: var(--muted); font-size: 13px; font-weight: 650; text-transform: uppercase; letter-spacing: .03em; }
    section { margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 11px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
    th { color: #334155; background: var(--bg); font-size: 13px; }
    .pill { display: inline-flex; align-items: center; min-width: 72px; justify-content: center; padding: 4px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .passed { background: #dcfce7; color: #166534; }
    .failed { background: #fee2e2; color: #991b1b; }
    .bar { width: 100%; height: 12px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
    .bar span { display: block; height: 100%; border-radius: inherit; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    code { background: #e2e8f0; padding: 2px 5px; border-radius: 5px; }
    @media (max-width: 820px) { .grid, .two-col { grid-template-columns: 1fr; } header { flex-direction: column; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>AI-EMS System Evaluation Report</h1>
        <p>Generated at ${escapeHtml(report.generatedAt)}. Command: <code>npm run test:system</code></p>
      </div>
      <div class="status">${overallOk ? 'PASS' : 'FAIL'}</div>
    </header>

    <div class="grid">
      <div class="card"><div class="metric-label">Automated Tests</div><div class="metric">${testSummary.total}</div><p>${testSummary.passed} passed, ${testSummary.failed} failed</p></div>
      <div class="card"><div class="metric-label">Test Pass Rate</div><div class="metric">${testSummary.passRate}%</div>${renderBar(testSummary.passed, testSummary.total, '#16a34a')}</div>
      <div class="card"><div class="metric-label">Cloud Syntax Checks</div><div class="metric">${syntaxSummary.total}</div><p>${syntaxSummary.passed} passed, ${syntaxSummary.failed} failed</p></div>
      <div class="card"><div class="metric-label">Total Runtime</div><div class="metric">${Math.round(report.summary.durationMs)} ms</div><p>Node automated evaluation</p></div>
    </div>

    <section>
      <h2>Pass Rate by Evaluation Area</h2>
      <table>
        <thead><tr><th>Area</th><th>Total</th><th>Passed</th><th>Failed</th><th>Visualization</th></tr></thead>
        <tbody>${categoryRows}</tbody>
      </table>
    </section>

    <section>
      <h2>Automated Test Cases</h2>
      <table>
        <thead><tr><th>#</th><th>Area</th><th>Test case</th><th>Status</th><th>Duration</th></tr></thead>
        <tbody>${testRows}</tbody>
      </table>
    </section>

    <section>
      <h2>Cloud Function Syntax Checks</h2>
      <table>
        <thead><tr><th>#</th><th>File</th><th>Status</th><th>Duration</th></tr></thead>
        <tbody>${syntaxRows}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function renderMarkdown(report) {
  const lines = [
    '# AI-EMS System Evaluation Summary',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    '| Metric | Result |',
    '|---|---:|',
    `| Automated tests | ${report.summary.tests.total} |`,
    `| Passed tests | ${report.summary.tests.passed} |`,
    `| Failed tests | ${report.summary.tests.failed} |`,
    `| Test pass rate | ${report.summary.tests.passRate}% |`,
    `| Cloud syntax checks | ${report.summary.syntaxChecks.total} |`,
    '',
    '## Evaluation Areas',
    '',
    '| Area | Total | Passed | Failed | Pass Rate |',
    '|---|---:|---:|---:|---:|',
    ...report.categories.map((item) => `| ${item.category} | ${item.total} | ${item.passed} | ${item.failed} | ${item.passRate}% |`),
    '',
    '## How to Reproduce',
    '',
    '```bash',
    'npm run test:system',
    '```',
    '',
    `HTML visualization: ${relative(path.join(reportDir, 'system-evaluation-report.html'))}`,
    `JSON result data: ${relative(path.join(reportDir, 'system-evaluation-results.json'))}`,
  ];
  return lines.join('\n');
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true });

  const testFiles = listFiles(path.join(root, 'tests'), (file) => file.endsWith('.cjs') && !file.includes(`${path.sep}reports${path.sep}`));
  const cloudFunctionFiles = listFiles(path.join(root, 'uniCloud-aliyun', 'cloudfunctions'), (file) => path.basename(file) === 'index.js');

  const testRun = runCommand(process.execPath, ['--test', '--test-reporter=tap', ...testFiles.map(relative)]);
  const tests = parseTap(`${testRun.stdout}\n${testRun.stderr}`);
  const syntaxChecks = cloudFunctionFiles.map((file) => {
    const check = runCommand(process.execPath, ['--check', relative(file)]);
    return {
      file: relative(file),
      status: check.status === 0 ? 'passed' : 'failed',
      durationMs: check.durationMs,
      stderr: check.stderr.trim(),
    };
  });

  const testSummary = summarize(tests);
  const syntaxSummary = summarize(syntaxChecks);
  const report = {
    generatedAt: generatedAt.toISOString(),
    summary: {
      tests: testSummary,
      syntaxChecks: syntaxSummary,
      total: testSummary.total + syntaxSummary.total,
      passed: testSummary.passed + syntaxSummary.passed,
      failed: testSummary.failed + syntaxSummary.failed,
      durationMs: testRun.durationMs + syntaxChecks.reduce((sum, item) => sum + item.durationMs, 0),
    },
    commands: {
      tests: testRun.command,
      syntaxCheckPattern: `${process.execPath} --check uniCloud-aliyun/cloudfunctions/*/index.js`,
    },
    categories: groupByCategory(tests),
    tests,
    syntaxChecks,
    raw: {
      testStdout: testRun.stdout,
      testStderr: testRun.stderr,
    },
  };

  fs.writeFileSync(path.join(reportDir, 'system-evaluation-results.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportDir, 'system-evaluation-report.html'), renderHtml(report));
  fs.writeFileSync(path.join(reportDir, 'system-evaluation-summary.md'), renderMarkdown(report));

  console.log(`System evaluation report generated: ${relative(path.join(reportDir, 'system-evaluation-report.html'))}`);
  console.log(`Automated tests: ${testSummary.passed}/${testSummary.total} passed`);
  console.log(`Cloud syntax checks: ${syntaxSummary.passed}/${syntaxSummary.total} passed`);

  if (report.summary.failed > 0 || testRun.status !== 0) {
    process.exitCode = 1;
  }
}

main();
