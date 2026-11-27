#!/usr/bin/env node
'use strict';

/**
 * RedactLocal — Dependency-Free Node Test Suite
 * Runs built-in engine self-tests, extended CSV/preview/edge assertions,
 * module isolation checks, UI/stats tests, and static accessibility/security hygiene checks.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');

function existsExactCase(relPath) {
  const clean = relPath.split('#')[0].split('?')[0].replace(/^\.\//, '');
  if (!clean) return false;
  const parts = clean.split('/').filter(Boolean);
  let cur = ROOT_DIR;
  for (let i = 0; i < parts.length; i++) {
    if (!fs.existsSync(cur)) return false;
    const entries = fs.readdirSync(cur);
    if (!entries.includes(parts[i])) return false;
    cur = path.join(cur, parts[i]);
  }
  return fs.existsSync(cur);
}

function loadScriptInSandbox(relPath, extraGlobals) {
  const code = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
  const storageMap = new Map();
  const sandbox = {
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    JSON,
    RegExp,
    Error,
    Uint8Array,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k),
    },
    matchMedia: () => ({ matches: false }),
    ...extraGlobals,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: relPath });
  return { sandbox, storageMap };
}

function runSuite() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      passed += 1;
      console.log(`  PASS: ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL: ${name} -> ${err && err.message ? err.message : String(err)}`);
    }
  }

  console.log('--- 1. Built-In Engine & Stats Self-Tests (engine.js) ---');
  require(path.join(ROOT_DIR, 'scripts', 'stats.js'));
  require(path.join(ROOT_DIR, 'engine.js'));

  const Engine = globalThis.RedactEngine;
  assert.ok(Engine && typeof globalThis.runSelfTests === 'function', 'RedactEngine and runSelfTests present');

  const engineSummary = globalThis.runSelfTests();
  engineSummary.results.forEach((r) => {
    if (r.passed) {
      passed += 1;
    } else {
      failed += 1;
      console.error(`  FAIL: ${r.name} -> ${r.error}`);
    }
  });
  console.log(`Engine self-tests: ${engineSummary.passed}/${engineSummary.total} passed`);

  console.log('\n--- 2. Extended Engine, CSV & Preview Edge Tests ---');

  test('CSV auto-detects semicolon (;) and tab (\\t) delimiters and preserves CR/LF endings', () => {
    const semi = Engine.sanitizeInput('a;b\r1;priya@finserve.in\r', { isCsv: true, mode: 'full' });
    assert.strictEqual(semi.csvDelimiter, ';');
    assert.strictEqual(semi.sanitizedText, 'a;b\r1;[REDACTED]\r');

    const tab = Engine.sanitizeInput('a\tb\n1\tpriya@finserve.in\n', { isCsv: true, mode: 'full' });
    assert.strictEqual(tab.csvDelimiter, '\t');
    assert.strictEqual(tab.sanitizedText, 'a\tb\n1\t[REDACTED]\n');
  });

  test('CSV handles unclosed quotes and stray post-quote characters safely', () => {
    const unclosed = Engine.parseCsvRfc4180('a,"unclosed cell');
    assert.strictEqual(unclosed.rows.length, 1);
    assert.strictEqual(unclosed.rows[0].cells[1].value, 'unclosed cell');
    assert.strictEqual(unclosed.rows[0].cells[1].wasQuoted, true);

    const stray = Engine.parseCsvRfc4180('"hello"stray,next\n');
    assert.strictEqual(stray.rows[0].cells[0].value, 'hello');
    assert.strictEqual(stray.rows[0].cells[1].value, 'next');
  });

  test('Single-row 270k CSV obeys previewLimit while keeping 100% sanitizedText intact', () => {
    const bigCell = 'priya@finserve.in '.repeat(15000);
    const oneRowCsv = `id,data\n1,"${bigCell}"\n`;
    const res = Engine.sanitizeInput(oneRowCsv, {
      isCsv: true,
      mode: 'full',
      previewLimit: Engine.LARGE_PREVIEW_CHAR_LIMIT,
    });
    assert.strictEqual(res.truncatedPreview, true);
    assert.strictEqual(res.stats.EMAIL, 15000);
    assert.ok(!res.sanitizedText.includes('priya@finserve.in'));
  });

  test('Dense 35k-span plain text caps DOM preview spans cleanly', () => {
    const dense = 'a@b.co '.repeat(35000);
    const res = Engine.sanitizeInput(dense, {
      mode: 'full',
      previewLimit: Engine.LARGE_PREVIEW_CHAR_LIMIT,
    });
    assert.strictEqual(res.truncatedPreview, true);
    assert.strictEqual(res.stats.EMAIL, 35000);
    assert.ok(!res.sanitizedText.includes('a@b.co'));
  });

  test('Email detector rejects consecutive dots and leading dot/hyphen domains', () => {
    const bad = 'bad1@sub..domain.com bad2@.domain.com bad3@-domain.com good@domain.com';
    const res = Engine.sanitizeInput(bad, { mode: 'full' });
    assert.strictEqual(res.stats.EMAIL, 1);
    assert.ok(res.sanitizedText.endsWith('[REDACTED]'));
  });

  test('Overlap priority enforces IPV6 > IPV4, Partial E.164/IPv6 masks, and download filenames', () => {
    const ipv6Vs4 = Engine.sanitizeInput('ip=::ffff:192.168.1.1 vs v4=192.168.1.1', { mode: 'pseudonym' });
    assert.strictEqual(ipv6Vs4.stats.IP, 2);

    const partialIntl = Engine.sanitizeInput('+1 (415) 555-0192 | ::1', { mode: 'partial' });
    assert.strictEqual(partialIntl.sanitizedText, '+X (XXX) XXX-0192 | ::XXXX');

    assert.strictEqual(Engine.buildDownloadFilename('report.v2.csv', true), 'report.v2_sanitized.csv');
    assert.strictEqual(Engine.buildDownloadFilename('report.txt', true), 'report_sanitized.csv');
    assert.strictEqual(Engine.buildDownloadFilename('', false), 'sanitized_output.txt');
  });

  console.log('\n--- 3. Stats & UI Module Tests (scripts/stats.js, scripts/shared.js) ---');

  test('RedactStats deduplicates same-input exports, recovers corrupt JSON, and reset() zeroes storage', () => {
    const { sandbox, storageMap } = loadScriptInSandbox('scripts/stats.js');
    const Stats = sandbox.RedactStats;

    const sampleStats = { total: 5, EMAIL: 2, PHONE: 1, IP: 1, PAN: 1, AADHAAR: 0, CREDIT_CARD: 0, luhnRejectedCount: 1 };
    assert.strictEqual(Stats.recordRun({ text: '   ', stats: sampleStats, sourceType: 'sample' }), false);
    assert.strictEqual(Stats.recordRun({ text: 'raw payload 1', stats: sampleStats, sourceType: 'sample' }), true);
    assert.strictEqual(Stats.recordRun({ text: 'raw payload 1', stats: sampleStats, sourceType: 'export' }), false);
    assert.strictEqual(Stats.recordRun({ text: 'raw payload 2', stats: sampleStats, sourceType: 'export' }), true);
    assert.strictEqual(Stats.recordRun({ text: 'raw payload 2', stats: sampleStats, sourceType: 'file' }), true);

    const saved = Stats.getStats();
    assert.strictEqual(saved.runs, 3);
    assert.strictEqual(saved.filesProcessed, 1);
    assert.strictEqual(saved.totalEntities, 15);
    assert.strictEqual(saved.luhnRejected, 3);

    const rawJson = storageMap.get(Stats.STATS_STORAGE_KEY);
    assert.ok(!rawJson.includes('raw payload'), 'No raw text stored in localStorage');

    storageMap.set(Stats.STATS_STORAGE_KEY, '{"totalEntities": -5, "byType": {"EMAIL": "bad"}, "lastUsed": "not-a-date"}');
    const sanitized = Stats.getStats();
    assert.strictEqual(sanitized.totalEntities, 0);
    assert.strictEqual(sanitized.byType.EMAIL, 0);
    assert.strictEqual(sanitized.lastUsed, null);

    Stats.reset();
    assert.strictEqual(Stats.getStats().runs, 0);
    assert.strictEqual(Stats.getStats().totalEntities, 0);
  });

  test('RedactUI exposes clean namespace, formatters, and prefers-color-scheme fallback', () => {
    const { sandbox } = loadScriptInSandbox('scripts/shared.js');
    const UI = sandbox.RedactUI;
    assert.strictEqual(UI.THEME_STORAGE_KEY, 'redactlocal_theme');
    assert.strictEqual(UI.formatBytes(0), '0 B');
    assert.strictEqual(UI.formatBytes(1536), '1.5 KB');
    assert.strictEqual(UI.formatBytes(2 * 1024 * 1024), '2.00 MB');
    assert.strictEqual(UI.formatNumber(123456), '123,456');
    assert.strictEqual(UI.getPreferredTheme(), 'light');
  });

  console.log('\n--- 4. Static Security, Accessibility, Bloatware & CSP Checks ---');

  const htmlFiles = ['index.html', 'sanitizer.html', 'how-it-works.html', 'dashboard.html', 'privacy.html', '404.html'];
  const titles = new Set();
  const descriptions = new Set();

  htmlFiles.forEach((file) => {
    test(`${file}: lang="en", unique title & description, skip link, main[tabindex="-1"], SVG attrs, valid links`, () => {
      const html = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
      assert.ok(/<html\s+lang="en">/i.test(html), 'Missing lang="en"');

      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      assert.ok(titleMatch && titleMatch[1].trim().length > 0, 'Missing title');
      assert.ok(!titles.has(titleMatch[1].trim()), `Duplicate title: ${titleMatch[1]}`);
      titles.add(titleMatch[1].trim());

      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
      assert.ok(descMatch && descMatch[1].trim().length > 20, 'Missing meta description');
      assert.ok(!descriptions.has(descMatch[1].trim()), `Duplicate meta description in ${file}`);
      descriptions.add(descMatch[1].trim());

      assert.ok(html.includes('href="#main-content"') && html.includes('class="skip-link"'), 'Missing skip link');
      assert.ok(/<main\b[^>]*id="main-content"[^>]*tabindex="-1"/i.test(html), 'Missing main#main-content[tabindex="-1"]');
      assert.strictEqual((html.match(/<h1\b/gi) || []).length, 1, 'Expected exactly one <h1>');

      const svgs = [...html.matchAll(/<svg\b([^>]*)>/gi)].map((m) => m[1]);
      svgs.forEach((attrs) => {
        assert.ok(/focusable="false"/i.test(attrs), 'Decorative SVG missing focusable="false"');
        assert.ok(/aria-hidden="true"|role="img"/i.test(attrs), 'SVG missing aria-hidden or role="img"');
      });

      assert.strictEqual((html.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) || []).length, 0, 'Inline script disallowed');
      assert.strictEqual((html.match(/\btype="module"/gi) || []).length, 0, 'ES module script disallowed');
      assert.strictEqual((html.match(/\bstyle="/gi) || []).length, 0, 'Inline style attribute disallowed');

      const refs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
      for (const ref of refs) {
        if (ref.startsWith('#') || ref.startsWith('data:')) continue;
        assert.ok(!/^https?:\/\//i.test(ref), `External URL disallowed: ${ref}`);
        assert.ok(!ref.startsWith('/'), `Root-absolute path disallowed: ${ref}`);
        assert.ok(existsExactCase(ref), `Broken or case-mismatched local asset: ${ref}`);
      }
    });
  });

  test('CSS has zero !important hacks and zero unused custom properties in tokens.css', () => {
    const tokens = fs.readFileSync(path.join(ROOT_DIR, 'styles/tokens.css'), 'utf8');
    const comp = fs.readFileSync(path.join(ROOT_DIR, 'styles/components.css'), 'utf8');
    const pages = fs.readFileSync(path.join(ROOT_DIR, 'styles/pages.css'), 'utf8');
    const allCss = `${tokens}\n${comp}\n${pages}`;

    assert.strictEqual((allCss.match(/!important/g) || []).length, 0, 'CSS must not contain !important');
    const varDefs = [...new Set([...tokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))];
    const unused = varDefs.filter((v) => !(allCss.match(new RegExp(`var\\(${v}\\)`, 'g')) || []).length);
    assert.deepStrictEqual(unused, [], `Unused CSS variables: ${unused.join(', ')}`);
  });

  test('JS exposes strictly clean module namespaces without legacy files or network APIs', () => {
    assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'app.js')), 'Legacy app.js should not exist');
    assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'style.css')), 'Legacy root style.css should not exist');
    assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'package.json')), 'Zero-dependency constraint requires no package.json');

    const jsFiles = [
      'engine.js',
      'scripts/theme-init.js',
      'scripts/shared.js',
      'scripts/stats.js',
      'scripts/sanitizer-ui.js',
      'scripts/how-it-works.js',
      'scripts/dashboard.js',
    ];
    for (const jf of jsFiles) {
      const src = fs.readFileSync(path.join(ROOT_DIR, jf), 'utf8');
      assert.ok(!/\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/.test(src), `Network call in ${jf}`);
      assert.ok(!/RedactLocal(?:Engine|Stats|UI)/.test(src), `Legacy namespace still present in ${jf}`);
    }
  });

  test('vercel.json CSP headers & repo UTF-8 encoding remain intact', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8'));
    const byKey = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));
    assert.ok(byKey['Content-Security-Policy'].includes("connect-src 'none'"));
    assert.ok(byKey['Content-Security-Policy'].includes("script-src 'self';"));
    assert.ok(byKey['Content-Security-Policy'].includes("frame-ancestors 'none'"));
    assert.strictEqual(byKey['X-Content-Type-Options'], 'nosniff');
    assert.strictEqual(byKey['X-Frame-Options'], 'DENY');
    assert.strictEqual(byKey['Referrer-Policy'], 'no-referrer');
    assert.ok(Boolean(byKey['Permissions-Policy']));

    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'LICENSE')), 'Missing LICENSE');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'SECURITY.md')), 'Missing SECURITY.md');

    const textFiles = [
      ...htmlFiles,
      'engine.js',
      'scripts/theme-init.js',
      'scripts/shared.js',
      'scripts/stats.js',
      'scripts/sanitizer-ui.js',
      'scripts/how-it-works.js',
      'scripts/dashboard.js',
      'styles/tokens.css',
      'styles/components.css',
      'styles/pages.css',
      'README.md',
      'PROMPT_LOG.md',
      'PROMPTS.md',
      'SECURITY.md',
    ];
    for (const f of textFiles) {
      const content = fs.readFileSync(path.join(ROOT_DIR, f), 'utf8');
      assert.ok(
        !/\u00e2[\u0080-\u00bf\u20ac\u201a-\u2026\u0152-\u0178\u2122]|\u00c3[\u0080-\u00bf]|\ufffd/.test(content),
        `Encoding mojibake detected in ${f}`
      );
    }
  });

  console.log(`\n=== Total: ${passed}/${passed + failed} passed, ${failed} failed ===`);
  if (failed > 0) process.exitCode = 1;
}

runSuite();
