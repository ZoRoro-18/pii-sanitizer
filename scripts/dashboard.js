(function () {
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

  document.addEventListener('DOMContentLoaded', () => {
    const Stats = window.RedactLocalStats;
    const UI = window.RedactLocalUI;
    if (!Stats || !UI) return;

    const kpiTotal = document.getElementById('kpi-total-entities');
    const kpiFiles = document.getElementById('kpi-files-processed');
    const kpiLuhn = document.getElementById('kpi-luhn-rejected');
    const kpiLastUsed = document.getElementById('kpi-last-used');
    const chartEmpty = document.getElementById('dashboard-chart-empty');
    const chartContainer = document.getElementById('dashboard-bar-chart');
    const resetBtn = document.getElementById('reset-stats-btn');

    function renderDashboard() {
      const stats = Stats.getStats();

      if (kpiTotal) kpiTotal.textContent = UI.formatNumber(stats.totalEntities);
      if (kpiFiles) kpiFiles.textContent = UI.formatNumber(stats.filesProcessed);
      if (kpiLuhn) kpiLuhn.textContent = UI.formatNumber(stats.luhnRejected);
      if (kpiLastUsed) kpiLastUsed.textContent = UI.formatDateHuman(stats.lastUsed);

      if (resetBtn) {
        resetBtn.disabled = stats.runs === 0 && stats.totalEntities === 0 && stats.luhnRejected === 0 && !stats.lastUsed;
      }

      if (!chartEmpty || !chartContainer) return;

      const total = stats.totalEntities;
      if (total === 0) {
        chartEmpty.hidden = false;
        chartContainer.hidden = true;
        chartContainer.textContent = '';
        return;
      }

      chartEmpty.hidden = true;
      chartContainer.hidden = false;
      chartContainer.textContent = '';

      const frag = document.createDocumentFragment();
      for (let i = 0; i < ENTITY_META.length; i++) {
        const item = ENTITY_META[i];
        const count = stats.byType[item.key] || 0;
        const pct = total > 0 ? (count / total) * 100 : 0;

        const row = document.createElement('div');
        row.className = 'bar-row';

        const label = document.createElement('div');
        label.className = 'bar-label';
        const dot = document.createElement('span');
        dot.className = `entity-dot entity-dot-${item.key}`;
        label.appendChild(dot);
        label.appendChild(document.createTextNode(item.label));

        const track = document.createElement('div');
        track.className = 'bar-track';
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', `${item.label} share`);
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', pct.toFixed(1));

        const fill = document.createElement('div');
        fill.className = `bar-fill bar-fill-${item.key}`;
        fill.style.width = `${pct.toFixed(2)}%`;
        track.appendChild(fill);

        const metric = document.createElement('div');
        metric.className = 'bar-metric';
        metric.textContent = `${UI.formatNumber(count)} (${pct.toFixed(1)}%)`;

        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(metric);
        frag.appendChild(row);
      }

      chartContainer.appendChild(frag);
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        UI.openConfirmModal({
          title: 'Reset Local Statistics?',
          message: 'This clears all aggregate entity counts and run totals stored in redactlocal_stats_v1 on this browser. This action cannot be undone.',
          confirmLabel: 'Reset Stats',
          cancelLabel: 'Cancel',
          confirmVariant: 'danger',
          onConfirm: () => {
            Stats.resetStats();
            renderDashboard();
            UI.showToast('Local dashboard statistics reset', 'info');
          },
        });
      });
    }

    window.addEventListener('storage', (e) => {
      if (e.key === Stats.STATS_STORAGE_KEY) {
        renderDashboard();
      }
    });

    renderDashboard();
  });
})();
