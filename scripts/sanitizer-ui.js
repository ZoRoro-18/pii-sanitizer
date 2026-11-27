(function () {
  'use strict';

  const DEBOUNCE_MS = 200;
  const LARGE_DEBOUNCE_MS = 350;
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = ['.txt', '.csv'];

  const MODE_LABELS = {
    full: 'Full Mask',
    partial: 'Partial Mask',
    pseudonym: 'Consistent Pseudonymization',
  };

  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', () => {
    const Engine = window.RedactLocalEngine;
    const UI = window.RedactLocalUI;
    const Stats = window.RedactLocalStats;

    if (!Engine || !UI) return;

    const els = {
      csvModeToggle: document.getElementById('csv-mode-toggle'),
      loadSampleBtn: document.getElementById('load-sample-btn'),
      clearBtn: document.getElementById('clear-btn'),
      dropZone: document.getElementById('drop-zone'),
      fileInput: document.getElementById('file-input'),
      filePickerBtn: document.querySelector('.file-picker-btn'),
      fileChip: document.getElementById('file-chip'),
      fileName: document.getElementById('file-name'),
      fileSize: document.getElementById('file-size'),
      fileClearBtn: document.getElementById('file-clear-btn'),
      inputErrorBanner: document.getElementById('input-error-banner'),
      inputErrorText: document.getElementById('input-error-text'),
      rawInput: document.getElementById('raw-input'),
      inputMeta: document.getElementById('input-meta'),
      modeButtons: Array.from(document.querySelectorAll('.segmented-tab[data-mode]')),
      strictVerhoeffToggle: document.getElementById('strict-verhoeff-toggle'),
      entityCheckboxes: Array.from(document.querySelectorAll('#entity-toggles input[type="checkbox"]')),
      statTotal: document.getElementById('stat-total'),
      statEmail: document.getElementById('stat-EMAIL'),
      statPhone: document.getElementById('stat-PHONE'),
      statIp: document.getElementById('stat-IP'),
      statPan: document.getElementById('stat-PAN'),
      statAadhaar: document.getElementById('stat-AADHAAR'),
      statCard: document.getElementById('stat-CREDIT_CARD'),
      statLuhnRejected: document.getElementById('stat-luhn-rejected'),
      largeInputNotice: document.getElementById('large-input-notice'),
      largeInputNoticeText: document.getElementById('large-input-notice-text'),
      toggleMapBtn: document.getElementById('toggle-map-btn'),
      closeMapBtn: document.getElementById('close-map-btn'),
      mapCountBadge: document.getElementById('map-count-badge'),
      mappingDrawer: document.getElementById('mapping-drawer'),
      mappingEmptyState: document.getElementById('mapping-empty-state'),
      mappingTableWrap: document.getElementById('mapping-table-wrap'),
      mappingTbody: document.getElementById('mapping-tbody'),
      copyBtn: document.getElementById('copy-btn'),
      copyBtnLabel: document.getElementById('copy-btn-label'),
      downloadBtn: document.getElementById('download-btn'),
      actionClearBtn: document.getElementById('action-clear-btn'),
      originalDiffPane: document.getElementById('original-diff-pane'),
      originalEmpty: document.getElementById('original-empty'),
      originalDiffContent: document.getElementById('original-diff-content'),
      originalPaneMeta: document.getElementById('original-pane-meta'),
      sanitizedDiffPane: document.getElementById('sanitized-diff-pane'),
      sanitizedEmpty: document.getElementById('sanitized-empty'),
      sanitizedDiffContent: document.getElementById('sanitized-diff-content'),
      sanitizedPaneMeta: document.getElementById('sanitized-pane-meta'),
      activeModeBadge: document.getElementById('active-mode-badge'),
      diffGrid: document.getElementById('diff-grid'),
      diffTooltip: document.getElementById('diff-tooltip'),
      diffTooltipDot: document.getElementById('diff-tooltip-dot'),
      diffTooltipLabel: document.getElementById('diff-tooltip-label'),
      diffTooltipRep: document.getElementById('diff-tooltip-rep'),
      stepperSteps: Array.from(document.querySelectorAll('#sanitizer-stepper .stepper-step')),
    };

    const state = {
      mode: 'full',
      strictVerhoeff: true,
      isCsv: false,
      loadedFileName: null,
      loadedFileSize: 0,
      enabledEntities: {
        EMAIL: true,
        PHONE: true,
        IP: true,
        PAN: true,
        AADHAAR: true,
        CREDIT_CARD: true,
      },
      lastSanitizedText: '',
      lastStats: null,
      hasExportedCurrent: false,
      mapOpen: false,
      debounceTimer: 0,
      copyFeedbackTimer: 0,
      dragDepth: 0,
    };

    // ----- Error Banner Helper -----
    function showInputError(message) {
      if (els.inputErrorBanner && els.inputErrorText) {
        els.inputErrorText.textContent = message;
        els.inputErrorBanner.hidden = false;
      }
      UI.showToast(message, 'error');
    }

    function clearInputError() {
      if (els.inputErrorBanner) {
        els.inputErrorBanner.hidden = true;
      }
    }

    // ----- Stepper Management -----
    function updateStepper(hasInput) {
      if (!els.stepperSteps.length) return;
      els.stepperSteps.forEach((stepEl, idx) => {
        stepEl.classList.remove('is-active', 'is-complete');
        if (!hasInput) {
          if (idx === 0) stepEl.classList.add('is-active');
        } else if (state.hasExportedCurrent) {
          if (idx < 3) stepEl.classList.add('is-complete');
          else stepEl.classList.add('is-active');
        } else {
          if (idx < 2) stepEl.classList.add('is-complete');
          else if (idx === 2) stepEl.classList.add('is-active');
        }
      });
    }

    // ----- Scroll Sync with Re-entrancy Guard -----
    let isSyncing = false;
    let activeSyncSource = null;
    let syncResetRaf = 0;

    function handlePaneScroll(source, target) {
      if (isSyncing && activeSyncSource !== source) return;
      isSyncing = true;
      activeSyncSource = source;
      target.scrollTop = source.scrollTop;
      target.scrollLeft = source.scrollLeft;
      if (syncResetRaf) cancelAnimationFrame(syncResetRaf);
      syncResetRaf = requestAnimationFrame(() => {
        isSyncing = false;
        activeSyncSource = null;
        syncResetRaf = 0;
      });
    }

    // ----- Instant Floating Tooltip (prevents overflow clipping) -----
    let activeHoverEl = null;

    function getDotColorVar(group) {
      switch (group) {
        case 'EMAIL': return 'var(--entity-email)';
        case 'PHONE': return 'var(--entity-phone)';
        case 'IP': return 'var(--entity-ip)';
        case 'PAN': return 'var(--entity-pan)';
        case 'AADHAAR': return 'var(--entity-aadhaar)';
        case 'CREDIT_CARD': return 'var(--entity-card)';
        default: return 'var(--accent)';
      }
    }

    function showDiffTooltip(target) {
      if (!els.diffTooltip || typeof target.getBoundingClientRect !== 'function') return;
      const label = target.getAttribute('data-label');
      const rep = target.getAttribute('data-rep');
      const group = target.getAttribute('data-group');
      if (!label || rep === null) return;

      if (target.hasAttribute('title')) {
        target.setAttribute('data-native-title', target.getAttribute('title'));
        target.removeAttribute('title');
      }
      activeHoverEl = target;
      els.diffTooltipDot.style.background = getDotColorVar(group);
      els.diffTooltipLabel.textContent = label;
      els.diffTooltipRep.textContent = rep;
      els.diffTooltip.hidden = false;

      const rect = target.getBoundingClientRect();
      const tipRect = els.diffTooltip.getBoundingClientRect();
      const margin = 8;
      let top = rect.top - tipRect.height - margin;
      if (top < 8) {
        top = rect.bottom + margin;
      }
      let left = rect.left + (rect.width - tipRect.width) / 2;
      const vw = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1024;
      left = Math.max(12, Math.min(left, vw - tipRect.width - 12));
      els.diffTooltip.style.top = `${Math.round(top)}px`;
      els.diffTooltip.style.left = `${Math.round(left)}px`;
    }

    function hideDiffTooltip() {
      if (activeHoverEl && activeHoverEl.hasAttribute('data-native-title')) {
        activeHoverEl.setAttribute('title', activeHoverEl.getAttribute('data-native-title'));
        activeHoverEl.removeAttribute('data-native-title');
      }
      activeHoverEl = null;
      if (els.diffTooltip) els.diffTooltip.hidden = true;
    }

    els.originalDiffPane.addEventListener('scroll', () => {
      hideDiffTooltip();
      handlePaneScroll(els.originalDiffPane, els.sanitizedDiffPane);
    });

    els.sanitizedDiffPane.addEventListener('scroll', () => {
      hideDiffTooltip();
      handlePaneScroll(els.sanitizedDiffPane, els.originalDiffPane);
    });

    if (els.diffGrid) {
      els.diffGrid.addEventListener('mouseover', (e) => {
        const target = e.target && typeof e.target.closest === 'function'
          ? e.target.closest('.pii-mark, .sanitized-token')
          : null;
        if (target) showDiffTooltip(target);
      });

      els.diffGrid.addEventListener('mouseout', (e) => {
        if (!activeHoverEl) return;
        const related = e.relatedTarget;
        if (related && activeHoverEl.contains && activeHoverEl.contains(related)) return;
        hideDiffTooltip();
      });
    }

    // ----- Rendering & Processing -----
    function updateInputMeta(text) {
      const chars = text.length;
      let lines = 0;
      if (chars > 0) {
        lines = 1;
        for (let i = 0; i < chars; i++) {
          const ch = text.charCodeAt(i);
          if (ch === 10) {
            lines++;
          } else if (ch === 13) {
            lines++;
            if (i + 1 < chars && text.charCodeAt(i + 1) === 10) i++;
          }
        }
      }
      const csvTag = state.isCsv ? ' · CSV-Aware' : '';
      els.inputMeta.textContent = `${UI.formatNumber(chars)} characters · ${UI.formatNumber(lines)} lines${csvTag}`;
    }

    function renderStats(stats) {
      els.statTotal.textContent = UI.formatNumber(stats.total);
      els.statEmail.textContent = UI.formatNumber(stats.EMAIL);
      els.statPhone.textContent = UI.formatNumber(stats.PHONE);
      els.statIp.textContent = UI.formatNumber(stats.IP);
      els.statPan.textContent = UI.formatNumber(stats.PAN);
      els.statAadhaar.textContent = UI.formatNumber(stats.AADHAAR);
      els.statCard.textContent = UI.formatNumber(stats.CREDIT_CARD);
      els.statLuhnRejected.textContent = UI.formatNumber(stats.luhnRejectedCount);
    }

    function renderMappingTable(mappings) {
      els.mapCountBadge.textContent = UI.formatNumber(mappings.length);
      if (state.mode !== 'pseudonym' || mappings.length === 0) {
        els.mappingEmptyState.hidden = false;
        els.mappingTableWrap.hidden = true;
        els.mappingTbody.textContent = '';
        return;
      }

      els.mappingEmptyState.hidden = true;
      els.mappingTableWrap.hidden = false;

      const frag = document.createDocumentFragment();
      const maxRows = 500;
      const count = Math.min(mappings.length, maxRows);

      for (let i = 0; i < count; i++) {
        const entry = mappings[i];
        const tr = document.createElement('tr');

        const tdPlaceholder = document.createElement('td');
        tdPlaceholder.textContent = entry.placeholder;

        const tdType = document.createElement('td');
        const pill = document.createElement('span');
        pill.className = 'mapping-type-pill';
        const dot = document.createElement('span');
        dot.className = 'entity-dot';
        dot.style.background = getDotColorVar(entry.entityGroup);
        pill.appendChild(dot);
        pill.appendChild(document.createTextNode(entry.entityTypeLabel));
        tdType.appendChild(pill);

        const tdOriginal = document.createElement('td');
        tdOriginal.textContent = entry.originalSample;

        const tdCount = document.createElement('td');
        tdCount.textContent = String(entry.count);

        tr.appendChild(tdPlaceholder);
        tr.appendChild(tdType);
        tr.appendChild(tdOriginal);
        tr.appendChild(tdCount);
        frag.appendChild(tr);
      }

      if (mappings.length > maxRows) {
        const trMore = document.createElement('tr');
        const tdMore = document.createElement('td');
        tdMore.colSpan = 4;
        tdMore.textContent = `Showing first ${maxRows} of ${UI.formatNumber(mappings.length)} unique placeholders.`;
        trMore.appendChild(tdMore);
        frag.appendChild(trMore);
      }

      els.mappingTbody.textContent = '';
      els.mappingTbody.appendChild(frag);
    }

    function processAndRender() {
      const text = els.rawInput.value;
      updateInputMeta(text);
      els.activeModeBadge.textContent = MODE_LABELS[state.mode];

      if (!/\S/.test(text)) {
        const emptyResult = Engine.sanitizeInput('', {
          mode: state.mode,
          strictVerhoeff: state.strictVerhoeff,
          isCsv: state.isCsv,
          enabledEntities: state.enabledEntities,
        });
        state.lastSanitizedText = '';
        state.lastStats = emptyResult.stats;
        state.hasExportedCurrent = false;
        renderStats(emptyResult.stats);
        renderMappingTable([]);
        updateStepper(false);
        els.largeInputNotice.hidden = true;
        els.originalEmpty.hidden = false;
        els.originalDiffContent.hidden = true;
        els.originalDiffContent.textContent = '';
        els.sanitizedEmpty.hidden = false;
        els.sanitizedDiffContent.hidden = true;
        els.sanitizedDiffContent.textContent = '';
        if (els.originalPaneMeta) els.originalPaneMeta.textContent = '0 chars · 0 matches';
        if (els.sanitizedPaneMeta) els.sanitizedPaneMeta.textContent = '0 chars';
        els.copyBtn.disabled = true;
        els.downloadBtn.disabled = true;
        return null;
      }

      const res = Engine.sanitizeInput(text, {
        mode: state.mode,
        strictVerhoeff: state.strictVerhoeff,
        isCsv: state.isCsv,
        enabledEntities: state.enabledEntities,
        previewLimit: Engine.LARGE_PREVIEW_CHAR_LIMIT,
      });

      state.lastSanitizedText = res.sanitizedText;
      state.lastStats = res.stats;
      renderStats(res.stats);
      renderMappingTable(res.mappings);
      updateStepper(true);

      if (res.truncatedPreview) {
        els.largeInputNotice.hidden = false;
        els.largeInputNoticeText.textContent =
          `Large input (${UI.formatNumber(text.length)} chars): visual diff preview capped at first ` +
          `${UI.formatNumber(Engine.LARGE_PREVIEW_CHAR_LIMIT)} characters. Copy & Download include the complete sanitized output.`;
      } else {
        els.largeInputNotice.hidden = true;
      }

      if (els.originalPaneMeta) {
        els.originalPaneMeta.textContent = `${UI.formatNumber(text.length)} chars · ${UI.formatNumber(res.stats.total)} matches`;
      }
      if (els.sanitizedPaneMeta) {
        els.sanitizedPaneMeta.textContent = `${UI.formatNumber(res.sanitizedText.length)} chars`;
      }

      els.originalEmpty.hidden = true;
      els.originalDiffContent.hidden = false;
      els.originalDiffContent.innerHTML = res.originalHtml;

      els.sanitizedEmpty.hidden = true;
      els.sanitizedDiffContent.hidden = false;
      els.sanitizedDiffContent.innerHTML = res.sanitizedHtml;

      els.copyBtn.disabled = false;
      els.downloadBtn.disabled = false;
      return res;
    }

    function scheduleProcess() {
      state.hasExportedCurrent = false;
      clearInputError();
      if (state.debounceTimer) clearTimeout(state.debounceTimer);
      const len = els.rawInput.value.length;
      const delay = len > 250000 ? LARGE_DEBOUNCE_MS : len > 50000 ? DEBOUNCE_MS : 40;
      state.debounceTimer = setTimeout(() => {
        state.debounceTimer = 0;
        processAndRender();
      }, delay);
    }

    function processImmediately() {
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = 0;
      }
      return processAndRender();
    }

    // ----- File Handling -----
    function clearLoadedFile(clearTextToo, showToastMsg) {
      state.loadedFileName = null;
      state.loadedFileSize = 0;
      els.fileChip.hidden = true;
      els.fileName.textContent = '';
      els.fileSize.textContent = '';
      els.fileInput.value = '';
      clearInputError();
      if (clearTextToo) {
        els.rawInput.value = '';
        state.isCsv = false;
        els.csvModeToggle.checked = false;
        state.hasExportedCurrent = false;
        if (Stats) Stats.clearSessionFingerprint();
        processImmediately();
        if (showToastMsg) {
          UI.showToast('Workspace cleared', 'info');
        }
      }
    }

    function hasAllowedExtension(name) {
      const lower = String(name || '').toLowerCase();
      return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    }

    function loadFile(file) {
      if (!file) return;
      clearInputError();

      if (!hasAllowedExtension(file.name)) {
        showInputError(`Unsupported file "${file.name}". Please upload a .txt or .csv file.`);
        els.fileInput.value = '';
        return;
      }

      if (file.size === 0) {
        showInputError(`File "${file.name}" is empty (0 bytes).`);
        els.fileInput.value = '';
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        showInputError(
          `File "${file.name}" (${UI.formatBytes(file.size)}) exceeds the ${UI.formatBytes(MAX_FILE_SIZE_BYTES)} browser upload limit.`
        );
        els.fileInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => {
        showInputError(`Could not read "${file.name}". Check file permissions and try again.`);
      };
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : '';
        if (content.indexOf('\u0000') !== -1) {
          showInputError(`File "${file.name}" appears to contain binary data and cannot be sanitized as text or CSV.`);
          els.fileInput.value = '';
          return;
        }
        if (!/\S/.test(content)) {
          showInputError(`File "${file.name}" contains only whitespace.`);
          return;
        }
        state.loadedFileName = file.name;
        state.loadedFileSize = file.size;
        const isCsvFile = file.name.toLowerCase().endsWith('.csv');
        state.isCsv = isCsvFile;
        els.csvModeToggle.checked = isCsvFile;
        state.hasExportedCurrent = false;

        els.fileName.textContent = file.name;
        els.fileSize.textContent = UI.formatBytes(file.size);
        els.fileChip.hidden = false;

        els.rawInput.value = content;
        const res = processImmediately();
        if (Stats && res) {
          Stats.recordRun({
            text: content,
            stats: res.stats,
            sourceType: 'file',
          });
        }
        UI.showToast(`Loaded ${file.name} (${UI.formatBytes(file.size)})`, 'success');
      };
      reader.readAsText(file);
    }

    els.fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) loadFile(file);
    });

    if (els.filePickerBtn) {
      els.filePickerBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          els.fileInput.click();
        }
      });
    }

    els.fileClearBtn.addEventListener('click', () => clearLoadedFile(true, true));

    els.dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      state.dragDepth += 1;
      els.dropZone.classList.add('is-drag-over');
    });

    els.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    els.dropZone.addEventListener('dragleave', () => {
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (state.dragDepth === 0) {
        els.dropZone.classList.remove('is-drag-over');
      }
    });

    els.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      state.dragDepth = 0;
      els.dropZone.classList.remove('is-drag-over');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadFile(file);
    });

    // ----- Input & Control Listeners -----
    els.rawInput.addEventListener('input', scheduleProcess);

    els.csvModeToggle.addEventListener('change', () => {
      state.isCsv = els.csvModeToggle.checked;
      state.hasExportedCurrent = false;
      processImmediately();
    });

    els.loadSampleBtn.addEventListener('click', () => {
      clearLoadedFile(false, false);
      state.isCsv = false;
      els.csvModeToggle.checked = false;
      state.hasExportedCurrent = false;
      els.rawInput.value = Engine.SAMPLE_TEXT;
      const res = processImmediately();
      if (Stats && res) {
        Stats.recordRun({
          text: Engine.SAMPLE_TEXT,
          stats: res.stats,
          sourceType: 'sample',
        });
      }
      UI.showToast('Sample noisy dataset loaded locally', 'success');
    });

    els.clearBtn.addEventListener('click', () => clearLoadedFile(true, true));
    if (els.actionClearBtn) {
      els.actionClearBtn.addEventListener('click', () => clearLoadedFile(true, true));
    }

    els.modeButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const nextMode = btn.getAttribute('data-mode');
        if (!nextMode || nextMode === state.mode) return;
        state.mode = nextMode;
        state.hasExportedCurrent = false;
        els.modeButtons.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        processImmediately();
      });

      btn.addEventListener('keydown', (e) => {
        let targetIdx = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          targetIdx = (idx + 1) % els.modeButtons.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          targetIdx = (idx - 1 + els.modeButtons.length) % els.modeButtons.length;
        }
        if (targetIdx !== -1) {
          e.preventDefault();
          const nextBtn = els.modeButtons[targetIdx];
          if (typeof nextBtn.focus === 'function') nextBtn.focus();
          nextBtn.click();
        }
      });
    });

    els.strictVerhoeffToggle.addEventListener('change', () => {
      state.strictVerhoeff = els.strictVerhoeffToggle.checked;
      state.hasExportedCurrent = false;
      processImmediately();
    });

    els.entityCheckboxes.forEach((cb) => {
      cb.addEventListener('change', () => {
        const entity = cb.getAttribute('data-entity');
        if (entity) {
          state.enabledEntities[entity] = cb.checked;
          state.hasExportedCurrent = false;
          processImmediately();
        }
      });
    });

    // ----- Mapping Drawer Toggle -----
    function setMappingDrawerOpen(open, restoreFocus) {
      state.mapOpen = open;
      els.mappingDrawer.hidden = !open;
      els.toggleMapBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && typeof els.mappingDrawer.focus === 'function') {
        els.mappingDrawer.focus();
      } else if (!open && restoreFocus && typeof els.toggleMapBtn.focus === 'function') {
        els.toggleMapBtn.focus();
      }
    }

    els.toggleMapBtn.addEventListener('click', () => setMappingDrawerOpen(!state.mapOpen, false));
    els.closeMapBtn.addEventListener('click', () => setMappingDrawerOpen(false, true));

    // ----- Copy & Download Actions -----
    function recordExportRun() {
      state.hasExportedCurrent = true;
      updateStepper(true);
      if (Stats && state.lastStats) {
        Stats.recordRun({
          text: els.rawInput.value,
          stats: state.lastStats,
          sourceType: 'export',
        });
      }
    }

    function showCopyConfirmation() {
      if (state.copyFeedbackTimer) clearTimeout(state.copyFeedbackTimer);
      els.copyBtn.classList.add('is-copied');
      els.copyBtnLabel.textContent = 'Copied!';
      UI.showToast('Sanitized output copied to clipboard', 'success');
      state.copyFeedbackTimer = setTimeout(() => {
        els.copyBtn.classList.remove('is-copied');
        els.copyBtnLabel.textContent = 'Copy Sanitized';
        state.copyFeedbackTimer = 0;
      }, 2000);
    }

    function fallbackCopyText(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (_) {
        ok = false;
      }
      document.body.removeChild(ta);
      if (ok) {
        showCopyConfirmation();
      } else {
        UI.showToast('Clipboard blocked by browser; use Download instead', 'error');
      }
    }

    els.copyBtn.addEventListener('click', () => {
      const output = state.lastSanitizedText;
      if (!output) return;
      recordExportRun();
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(output).then(showCopyConfirmation, () => fallbackCopyText(output));
      } else {
        fallbackCopyText(output);
      }
    });

    els.downloadBtn.addEventListener('click', () => {
      const output = state.lastSanitizedText;
      if (!output) return;
      recordExportRun();
      const filename = Engine.buildDownloadFilename(state.loadedFileName, state.isCsv);
      const mime = state.isCsv ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8';
      const blob = new Blob([output], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      UI.showToast(`Downloaded ${filename}`, 'success');
    });

    // Initialize empty state
    processImmediately();
  });
})();
