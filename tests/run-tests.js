#!/usr/bin/env node
'use strict';

/**
 * RedactLocal — Dependency-Free Node Test Suite
 * Runs engine self-tests, CSV/detector edge assertions, UI module unit tests,
 * and static/accessibility/CSP hygiene checks with zero external packages.
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
  const failures = [];

  function test(name, fn) {
    try {
      fn();
      passed += 1;
      console.log(`  PASS: ${name}`);
    } catch (err) {
      failed += 1;
      const msg = err && err.message ? err.message : String(err);
      failures.push({ name, msg });
      console.error(`  FAIL: ${name} -> ${msg}`);
    }
  }

  console.log('--- 1. Built-In Engine Self-Tests (engine.js) ---');
  require(path.join(ROOT_DIR, 'engine.js'));
  const Engine = globalThis.RedactLocalEngine;
  assert.ok(Engine && typeof globalThis.runSelfTests === 'function', 'Engine exports present');

  const engineSummary = globalThis.runSelfTests();
  engineSummary.results.forEach((r) => {
    if (r.passed) {
      passed += 1;
    } else {
      failed += 1;
      failures.push({ name: r.name, msg: r.error });
    }
  });
  console.log(`Engine self-tests: ${engineSummary.passed}/${engineSummary.total} passed`);

  console.log('\n--- 2. Extended Engine, CSV & Preview Edge Tests ---');

  test('CSV auto-detects semicolon (;) and tab (\\t) delimiters and preserves CRLF/CR endings', () => {
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
    assert.ok(!res.sanitizedText.includes('priya@finserve.in'), 'No leaked emails in full CSV output');
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

  test('Overlap priority enforces IPV6 > IPV4, AADHAAR > PAN, and span length tie-breaks', () => {
    const ipv6Vs4 = Engine.sanitizeInput('ip=::ffff:192.168.1.1 vs v4=192.168.1.1', { mode: 'pseudonym' });
    assert.strictEqual(ipv6Vs4.stats.IP, 2);

    const partialIntl = Engine.sanitizeInput('+1 (415) 555-0192 | ::1', { mode: 'partial' });
    assert.strictEqual(partialIntl.sanitizedText, '+X (XXX) XXX-0192 | ::XXXX');

    assert.strictEqual(Engine.buildDownloadFilename('report.v2.csv', true), 'report.v2_sanitized.csv');
    assert.strictEqual(Engine.buildDownloadFilename('report.txt', true), 'report_sanitized.csv');
    assert.strictEqual(Engine.buildDownloadFilename('', false), 'sanitized_output.txt');
  });

  console.log('\n--- 3. Stats & Shared Module Tests (scripts/stats.js, scripts/shared.js) ---');

  test('RedactLocalStats deduplicates same-input exports and recovers from corrupt storage', () => {
    const { sandbox, storageMap } = loadScriptInSandbox('scripts/stats.js');
    const Stats = sandbox.RedactLocalStats;

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

    // Ensure raw user text is never written to localStorage
    const rawJson = storageMap.get(Stats.STATS_STORAGE_KEY);
    assert.ok(!rawJson.includes('raw payload'), 'No raw text stored in localStorage');

    // Corrupt storage recovery
    storageMap.set(Stats.STATS_STORAGE_KEY, '{"totalEntities": -5, "byType": {"EMAIL": "bad"}, "lastUsed": "not-a-date"}');
    const sanitized = Stats.getStats();
    assert.strictEqual(sanitized.totalEntities, 0);
    assert.strictEqual(sanitized.byType.EMAIL, 0);
    assert.strictEqual(sanitized.lastUsed, null);

    Stats.resetStats();
    assert.strictEqual(Stats.getStats().runs, 0);
  });

  test('RedactLocalUI helpers format bytes/numbers and read preferred theme', () => {
    const { sandbox } = loadScriptInSandbox('scripts/shared.js');
    const UI = sandbox.RedactLocalUI;
    assert.strictEqual(UI.THEME_STORAGE_KEY, 'redactlocal_theme');
    assert.strictEqual(UI.formatBytes(0), '0 B');
    assert.strictEqual(UI.formatBytes(1536), '1.5 KB');
    assert.strictEqual(UI.formatBytes(2 * 1024 * 1024), '2.00 MB');
    assert.strictEqual(UI.formatNumber(123456), '123,456');
    assert.strictEqual(UI.getPreferredTheme(), 'light');
  });

  console.log('\n--- 4. Static Security, Accessibility, Links & CSP Checks ---');

  const htmlFiles = ['index.html', 'sanitizer.html', 'how-it-works.html', 'dashboard.html', 'privacy.html', '404.html'];
  const titles = new Set();
  const descriptions = new Set();

  htmlFiles.forEach((file) => {
    test(`${file}: valid lang, unique title & meta description, skip link, relative links, zero inline scripts`, () => {
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

      assert.ok(html.includes('href="#main-content"') && html.includes('class="skip-link"'), 'Missing skip-to-content link');
      assert.ok(/<main\b[^>]*id="main-content"/i.test(html), 'Missing main#main-content landmark');
      assert.strictEqual((html.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) || []).length, 0, 'Inline script found');
      assert.strictEqual((html.match(/\btype="module"/gi) || []).length, 0, 'ES module script found');
      assert.strictEqual((html.match(/\bstyle="/gi) || []).length, 0, 'Inline style attribute found');

      // Check all href/src relative references exist with exact case & no external requests
      const refs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
      for (const ref of refs) {
        if (ref.startsWith('#') || ref.startsWith('data:')) continue;
        assert.ok(!/^https?:\/\//i.test(ref), `External URL disallowed: ${ref}`);
        assert.ok(!ref.startsWith('/'), `Root-absolute path disallowed: ${ref}`);
        assert.ok(existsExactCase(ref), `Broken or case-mismatched local asset: ${ref}`);
      }
    });
  });

  test('vercel.json enforces zero-network CSP, frame-ancestors, X-Frame-Options, and Permissions-Policy', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8'));
    const headerList = vercel.headers[0].headers;
    const byKey = Object.fromEntries(headerList.map((h) => [h.key, h.value]));

    assert.ok(byKey['Content-Security-Policy'].includes("connect-src 'none'"));
    assert.ok(byKey['Content-Security-Policy'].includes("script-src 'self';") || !byKey['Content-Security-Policy'].includes("script-src 'self' 'unsafe-inline'"));
    assert.ok(byKey['Content-Security-Policy'].includes("frame-ancestors 'none'"));
    assert.strictEqual(byKey['X-Content-Type-Options'], 'nosniff');
    assert.strictEqual(byKey['X-Frame-Options'], 'DENY');
    assert.strictEqual(byKey['Referrer-Policy'], 'no-referrer');
    assert.ok(Boolean(byKey['Permissions-Policy']), 'Permissions-Policy missing');
  });

  test('Repository has LICENSE, SECURITY.md, no package.json, and zero mojibake in HTML/JS/CSS', () => {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'LICENSE')), 'Missing LICENSE');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'SECURITY.md')), 'Missing SECURITY.md');
    assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'package.json')), 'Zero-dependency constraint requires no package.json');

    const jsCodeFiles = [
      'engine.js',
      'scripts/theme-init.js',
      'scripts/shared.js',
      'scripts/stats.js',
      'scripts/sanitizer-ui.js',
      'scripts/how-it-works.js',
      'scripts/dashboard.js',
    ];
    const uiCode = fs.readFileSync(path.join(ROOT_DIR, 'scripts/sanitizer-ui.js'), 'utf8');
    assert.ok(uiCode.includes('MAX_FILE_SIZE_BYTES'), 'Missing upload size limit constant in sanitizer-ui.js');

    for (const jf of jsCodeFiles) {
      const jsSrc = fs.readFileSync(path.join(ROOT_DIR, jf), 'utf8');
      assert.ok(!/\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/.test(jsSrc), `Network API call detected in ${jf}`);
    }

    const textFiles = [
      ...htmlFiles,
      ...jsCodeFiles,
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
  if (failed > 0) {
    process.exitCode = 1;
  }
}

runSuite();
