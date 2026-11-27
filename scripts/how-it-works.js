(() => {
  'use strict';

  const PRESETS = {
    visa: '4532-0151-1283-0366',
    amex: '3782-822463-10005',
    invalid: '4532-0151-1283-0367',
  };
  const CARD_MIN_DIGITS = 13;
  const CARD_MAX_DIGITS = 19;

  if (typeof document === 'undefined') return;

  function queryElements() {
    return {
      luhnInput: document.getElementById('luhn-demo-input'),
      luhnStepsGrid: document.getElementById('luhn-steps-grid'),
      luhnResultBadge: document.getElementById('luhn-result-badge'),
      luhnSumDisplay: document.getElementById('luhn-sum-display'),
      luhnBrandDisplay: document.getElementById('luhn-brand-display'),
      presetButtons: Array.from(document.querySelectorAll('[data-luhn-preset]')),
      badge: document.getElementById('hiw-selftest-badge'),
      rerunBtn: document.getElementById('hiw-rerun-tests-btn'),
      listEl: document.getElementById('hiw-selftest-list'),
    };
  }

  function computeLuhnSteps(digits) {
    const cells = [];
    let sum = 0;
    let shouldDouble = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      const d = digits.charCodeAt(i) - 48;
      let contrib = d;
      let opLabel = '×1';
      if (shouldDouble) {
        const doubled = d * 2;
        contrib = doubled > 9 ? doubled - 9 : doubled;
        opLabel = doubled > 9 ? `×2=${doubled}−9` : '×2';
      }
      sum += contrib;
      cells.unshift({ d, isDoubled: shouldDouble, opLabel, contrib });
      shouldDouble = !shouldDouble;
    }
    return { cells, sum };
  }

  function renderLuhnCells(grid, UI, cells) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      frag.appendChild(
        UI.createEl('div', {
          className: `luhn-digit-cell${c.isDoubled ? ' is-doubled' : ''}`,
          children: [
            UI.createEl('span', { className: 'luhn-digit-raw', text: String(c.d) }),
            UI.createEl('span', { className: 'luhn-digit-op', text: c.opLabel }),
            UI.createEl('span', { className: 'luhn-digit-contrib', text: `= ${c.contrib}` }),
          ],
        })
      );
    }
    grid.appendChild(frag);
  }

  function updateLuhnSummary(Engine, els, digits, sum) {
    const mod = sum % 10;
    if (els.luhnSumDisplay) els.luhnSumDisplay.textContent = `Sum: ${sum} (${sum} % 10 = ${mod})`;

    if (digits.length < CARD_MIN_DIGITS || digits.length > CARD_MAX_DIGITS) {
      if (els.luhnResultBadge) {
        els.luhnResultBadge.className = 'badge badge-warning';
        els.luhnResultBadge.textContent = `Invalid Length (${digits.length} digits; cards need ${CARD_MIN_DIGITS}–${CARD_MAX_DIGITS})`;
      }
      if (els.luhnBrandDisplay) els.luhnBrandDisplay.textContent = 'Brand: —';
      return;
    }

    const valid = Engine.isValidLuhn(digits);
    if (els.luhnResultBadge) {
      els.luhnResultBadge.className = valid ? 'badge badge-success' : 'badge badge-danger';
      els.luhnResultBadge.textContent = valid
        ? 'Valid Luhn Checksum (Accepted as PII)'
        : 'Invalid Checksum (Rejected & Exclusion Zone Active)';
    }
    if (els.luhnBrandDisplay) {
      els.luhnBrandDisplay.textContent = valid ? `Brand: ${Engine.detectCardBrand(digits)}` : 'Brand: Rejected';
    }
  }

  function renderLuhnBreakdown(Engine, UI, els) {
    if (!els.luhnInput || !els.luhnStepsGrid) return;
    const digits = els.luhnInput.value.replace(/\D/g, '');
    UI.clearChildren(els.luhnStepsGrid);

    if (!digits) {
      if (els.luhnResultBadge) {
        els.luhnResultBadge.className = 'badge badge-neutral';
        els.luhnResultBadge.textContent = 'Enter digits above';
      }
      if (els.luhnSumDisplay) els.luhnSumDisplay.textContent = 'Sum: —';
      if (els.luhnBrandDisplay) els.luhnBrandDisplay.textContent = 'Brand: —';
      return;
    }

    const { cells, sum } = computeLuhnSteps(digits);
    renderLuhnCells(els.luhnStepsGrid, UI, cells);
    updateLuhnSummary(Engine, els, digits, sum);
  }

  function executeAndRenderTests(UI, els, notify) {
    if (typeof window.runSelfTests !== 'function' || !els.badge || !els.listEl) return;
    const summary = window.runSelfTests();
    const allPass = summary.failed === 0;
    els.badge.className = `badge ${allPass ? 'badge-success' : 'badge-danger'}`;
    els.badge.textContent = `Self-test: ${summary.passed}/${summary.total} passed`;

    UI.clearChildren(els.listEl);
    const frag = document.createDocumentFragment();
    summary.results.forEach((r) => {
      frag.appendChild(
        UI.createEl('li', {
          className: `selftest-item ${r.passed ? 'pass' : 'fail'}`,
          text: r.passed ? `✓ ${r.name}` : `✗ ${r.name}: ${r.error}`,
        })
      );
    });
    els.listEl.appendChild(frag);

    if (notify) {
      UI.showToast(
        allPass ? `All ${summary.passed}/${summary.total} self-tests passed` : `${summary.failed} self-test(s) failed`,
        allPass ? 'success' : 'error'
      );
    }
  }

  function initHowItWorks() {
    const Engine = window.RedactEngine;
    const UI = window.RedactUI;
    if (!Engine || !UI) return;

    const els = queryElements();
    if (els.luhnInput) {
      els.luhnInput.addEventListener('input', () => renderLuhnBreakdown(Engine, UI, els));
      els.presetButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.getAttribute('data-luhn-preset');
          if (!key || !PRESETS[key]) return;
          els.luhnInput.value = PRESETS[key];
          renderLuhnBreakdown(Engine, UI, els);
        });
      });
      renderLuhnBreakdown(Engine, UI, els);
    }

    if (els.rerunBtn) els.rerunBtn.addEventListener('click', () => executeAndRenderTests(UI, els, true));
    executeAndRenderTests(UI, els, false);
  }

  document.addEventListener('DOMContentLoaded', initHowItWorks);
})();
