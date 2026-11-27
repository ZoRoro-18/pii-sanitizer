(() => {
  'use strict';

  const ENTITY_META = [
    { key: 'EMAIL', label: 'Email' },
    { key: 'PHONE', label: 'Phone' },
    { key: 'IP', label: 'IP (v4 / v6)' },
    { key: 'PAN', label: 'Indian PAN' },
    { key: 'AADHAAR', label: 'Aadhaar' },
    { key: 'CREDIT_CARD', label: 'Credit Card' },
  ];

  if (typeof document === 'undefined') return;

  function queryElements() {
    return {
      kpiTotal: document.getElementById('kpi-total-entities'),
      kpiFiles: document.getElementById('kpi-files-processed'),
      kpiLuhn: document.getElementById('kpi-luhn-rejected'),
      kpiLastUsed: document.getElementById('kpi-last-used'),
      chartEmpty: document.getElementById('dashboard-chart-empty'),
      chartContainer: document.getElementById('dashboard-bar-chart'),
      resetBtn: document.getElementById('reset-stats-btn'),
    };
  }

  function updateKpiTiles(UI, els, stats) {
    if (els.kpiTotal) els.kpiTotal.textContent = UI.formatNumber(stats.totalEntities);
    if (els.kpiFiles) els.kpiFiles.textContent = UI.formatNumber(stats.filesProcessed);
    if (els.kpiLuhn) els.kpiLuhn.textContent = UI.formatNumber(stats.luhnRejected);
    if (els.kpiLastUsed) els.kpiLastUsed.textContent = UI.formatDateHuman(stats.lastUsed);
    if (els.resetBtn) {
      els.resetBtn.disabled =
        stats.runs === 0 && stats.totalEntities === 0 && stats.luhnRejected === 0 && !stats.lastUsed;
    }
  }

  function createBarRow(UI, item, count, pct) {
    const fill = UI.createEl('div', { className: `bar-fill bar-fill-${item.key}` });
    fill.style.width = `${pct.toFixed(2)}%`;

    return UI.createEl('div', {
      className: 'bar-row',
      children: [
        UI.createEl('div', {
          className: 'bar-label',
          children: [UI.createEl('span', { className: `entity-dot entity-dot-${item.key}` }), document.createTextNode(item.label)],
        }),
        UI.createEl('div', {
          className: 'bar-track',
          attrs: {
            role: 'progressbar',
            'aria-label': `${item.label} share`,
            'aria-valuemin': '0',
            'aria-valuemax': '100',
            'aria-valuenow': pct.toFixed(1),
          },
          children: [fill],
        }),
        UI.createEl('div', { className: 'bar-metric', text: `${UI.formatNumber(count)} (${pct.toFixed(1)}%)` }),
      ],
    });
  }

  function renderDashboardView(Stats, UI, els) {
    const stats = Stats.getStats();
    updateKpiTiles(UI, els, stats);
    if (!els.chartEmpty || !els.chartContainer) return;

    const total = stats.totalEntities;
    UI.clearChildren(els.chartContainer);
    if (total === 0) {
      els.chartEmpty.hidden = false;
      els.chartContainer.hidden = true;
      return;
    }

    els.chartEmpty.hidden = true;
    els.chartContainer.hidden = false;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < ENTITY_META.length; i++) {
      const item = ENTITY_META[i];
      const count = stats.byType[item.key] || 0;
      frag.appendChild(createBarRow(UI, item, count, (count / total) * 100));
    }
    els.chartContainer.appendChild(frag);
  }

  function bindResetButton(Stats, UI, els) {
    if (!els.resetBtn) return;
    els.resetBtn.addEventListener('click', () => {
      UI.openConfirmModal({
        title: 'Reset Local Statistics?',
        message: 'This clears all aggregate entity counts and run totals stored in redactlocal_stats_v1 on this browser. This action cannot be undone.',
        confirmLabel: 'Reset Stats',
        cancelLabel: 'Cancel',
        confirmVariant: 'danger',
        onConfirm: () => {
          Stats.reset();
          renderDashboardView(Stats, UI, els);
          UI.showToast('Local dashboard statistics reset', 'info');
        },
      });
    });
  }

  function initDashboard() {
    const Stats = window.RedactStats;
    const UI = window.RedactUI;
    if (!Stats || !UI) return;

    const els = queryElements();
    bindResetButton(Stats, UI, els);
    window.addEventListener('storage', (e) => {
      if (e.key === Stats.STATS_STORAGE_KEY) renderDashboardView(Stats, UI, els);
    });
    renderDashboardView(Stats, UI, els);
  }

  document.addEventListener('DOMContentLoaded', initDashboard);
})();
