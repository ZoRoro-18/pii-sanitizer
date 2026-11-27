(function () {
  'use strict';

  const PRESETS = {
    visa: '4532-0151-1283-0366',
    amex: '3782-822463-10005',
    invalid: '4532-0151-1283-0367',
  };

  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', () => {
    const Engine = window.RedactLocalEngine;
    if (!Engine) return;

    // ----- Interactive Luhn Algorithm Demo -----
    const luhnInput = document.getElementById('luhn-demo-input');
    const luhnStepsGrid = document.getElementById('luhn-steps-grid');
    const luhnResultBadge = document.getElementById('luhn-result-badge');
    const luhnSumDisplay = document.getElementById('luhn-sum-display');
    const luhnBrandDisplay = document.getElementById('luhn-brand-display');
    const presetButtons = Array.from(document.querySelectorAll('[data-luhn-preset]'));

    function renderLuhnBreakdown() {
      if (!luhnInput || !luhnStepsGrid) return;
      const raw = luhnInput.value;
      const digits = raw.replace(/\D/g, '');
      luhnStepsGrid.textContent = '';

      if (!digits) {
        luhnResultBadge.className = 'badge badge-neutral';
        luhnResultBadge.textContent = 'Enter digits above';
        luhnSumDisplay.textContent = 'Sum: —';
        luhnBrandDisplay.textContent = 'Brand: —';
        return;
      }

      const cells = [];
      let sum = 0;
      let shouldDouble = false;

      for (let i = digits.length - 1; i >= 0; i--) {
        const d = digits.charCodeAt(i) - 48;
        let contrib = d;
        let opLabel = '×1';
        if (shouldDouble) {
          const doubled = d * 2;
          if (doubled > 9) {
            contrib = doubled - 9;
            opLabel = `×2=${doubled}−9`;
          } else {
            contrib = doubled;
            opLabel = '×2';
          }
        }
        sum += contrib;
        cells.unshift({ d, isDoubled: shouldDouble, opLabel, contrib });
        shouldDouble = !shouldDouble;
      }

      const frag = document.createDocumentFragment();
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const cell = document.createElement('div');
        cell.className = `luhn-digit-cell${c.isDoubled ? ' is-doubled' : ''}`;

        const rawSpan = document.createElement('span');
        rawSpan.className = 'luhn-digit-raw';
        rawSpan.textContent = String(c.d);

        const opSpan = document.createElement('span');
        opSpan.className = 'luhn-digit-op';
        opSpan.textContent = c.opLabel;

        const contribSpan = document.createElement('span');
        contribSpan.className = 'luhn-digit-contrib';
        contribSpan.textContent = `= ${c.contrib}`;

        cell.appendChild(rawSpan);
        cell.appendChild(opSpan);
        cell.appendChild(contribSpan);
        frag.appendChild(cell);
      }
      luhnStepsGrid.appendChild(frag);

      const mod = sum % 10;
      luhnSumDisplay.textContent = `Sum: ${sum} (${sum} % 10 = ${mod})`;

      if (digits.length < 13 || digits.length > 19) {
        luhnResultBadge.className = 'badge badge-warning';
        luhnResultBadge.textContent = `Invalid Length (${digits.length} digits; cards need 13–19)`;
        luhnBrandDisplay.textContent = 'Brand: —';
        return;
      }

      const valid = Engine.isValidLuhn(digits);
      if (valid) {
        const brand = Engine.detectCardBrand(digits);
        luhnResultBadge.className = 'badge badge-success';
        luhnResultBadge.textContent = 'Valid Luhn Checksum (Accepted as PII)';
        luhnBrandDisplay.textContent = `Brand: ${brand}`;
      } else {
        luhnResultBadge.className = 'badge badge-danger';
        luhnResultBadge.textContent = 'Invalid Checksum (Rejected & Exclusion Zone Active)';
        luhnBrandDisplay.textContent = 'Brand: Rejected';
      }
    }

    if (luhnInput) {
      luhnInput.addEventListener('input', renderLuhnBreakdown);
      presetButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.getAttribute('data-luhn-preset');
          if (key && PRESETS[key]) {
            luhnInput.value = PRESETS[key];
            renderLuhnBreakdown();
          }
        });
      });
      renderLuhnBreakdown();
    }

    // ----- Live Self-Test Runner (`window.runSelfTests()`) -----
    const badge = document.getElementById('hiw-selftest-badge');
    const rerunBtn = document.getElementById('hiw-rerun-tests-btn');
    const listEl = document.getElementById('hiw-selftest-list');

    function executeAndRenderTests(notify) {
      if (typeof window.runSelfTests !== 'function' || !badge || !listEl) return;
      const summary = window.runSelfTests();
      const allPass = summary.failed === 0;
      badge.className = `badge ${allPass ? 'badge-success' : 'badge-danger'}`;
      badge.textContent = `Self-test: ${summary.passed}/${summary.total} passed`;

      listEl.textContent = '';
      const frag = document.createDocumentFragment();
      summary.results.forEach((r) => {
        const li = document.createElement('li');
        li.className = `selftest-item ${r.passed ? 'pass' : 'fail'}`;
        li.textContent = r.passed ? `✓ ${r.name}` : `✗ ${r.name}: ${r.error}`;
        frag.appendChild(li);
      });
      listEl.appendChild(frag);

      if (notify && window.RedactLocalUI) {
        window.RedactLocalUI.showToast(
          allPass ? `All ${summary.passed}/${summary.total} self-tests passed` : `${summary.failed} self-test(s) failed`,
          allPass ? 'success' : 'error'
        );
      }
    }

    if (rerunBtn) {
      rerunBtn.addEventListener('click', () => executeAndRenderTests(true));
    }

    executeAndRenderTests(false);
  });
})();
