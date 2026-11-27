(() => {
  'use strict';

  const DEBOUNCE_MS = 200;
  const LARGE_DEBOUNCE_MS = 350;
  const FAST_DEBOUNCE_MS = 40;
  const MEDIUM_DEBOUNCE_THRESHOLD = 50000;
  const LARGE_DEBOUNCE_THRESHOLD = 250000;
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
  const COPY_FEEDBACK_MS = 2000;
  const URL_REVOKE_DELAY_MS = 1000;
  const MAX_MAPPING_ROWS = 500;
  const TOOLTIP_MARGIN_PX = 8;
  const TOOLTIP_VIEWPORT_PAD_PX = 12;
  const FALLBACK_VIEWPORT_WIDTH = 1024;
  const ALLOWED_EXTENSIONS = ['.txt', '.csv'];

  const MODE_LABELS = {
    full: 'Full Mask',
    partial: 'Partial Mask',
    pseudonym: 'Consistent Pseudonymization',
  };

  const ELEMENT_ID_MAP = {
    csvModeToggle: 'csv-mode-toggle',
    loadSampleBtn: 'load-sample-btn',
    clearBtn: 'clear-btn',
    dropZone: 'drop-zone',
    fileInput: 'file-input',
    fileChip: 'file-chip',
    fileName: 'file-name',
    fileSize: 'file-size',
    fileClearBtn: 'file-clear-btn',
    inputErrorBanner: 'input-error-banner',
    inputErrorText: 'input-error-text',
    rawInput: 'raw-input',
    inputMeta: 'input-meta',
    strictVerhoeffToggle: 'strict-verhoeff-toggle',
    statTotal: 'stat-total',
    statEmail: 'stat-EMAIL',
    statPhone: 'stat-PHONE',
    statIp: 'stat-IP',
    statPan: 'stat-PAN',
    statAadhaar: 'stat-AADHAAR',
    statCard: 'stat-CREDIT_CARD',
    statLuhnRejected: 'stat-luhn-rejected',
    largeInputNotice: 'large-input-notice',
    largeInputNoticeText: 'large-input-notice-text',
    toggleMapBtn: 'toggle-map-btn',
    closeMapBtn: 'close-map-btn',
    mapCountBadge: 'map-count-badge',
    mappingDrawer: 'mapping-drawer',
    mappingEmptyState: 'mapping-empty-state',
    mappingTableWrap: 'mapping-table-wrap',
    mappingTbody: 'mapping-tbody',
    copyBtn: 'copy-btn',
    copyBtnLabel: 'copy-btn-label',
    downloadBtn: 'download-btn',
    actionClearBtn: 'action-clear-btn',
    originalDiffPane: 'original-diff-pane',
    originalEmpty: 'original-empty',
    originalDiffContent: 'original-diff-content',
    originalPaneMeta: 'original-pane-meta',
    sanitizedDiffPane: 'sanitized-diff-pane',
    sanitizedEmpty: 'sanitized-empty',
    sanitizedDiffContent: 'sanitized-diff-content',
    sanitizedPaneMeta: 'sanitized-pane-meta',
    activeModeBadge: 'active-mode-badge',
    diffGrid: 'diff-grid',
    diffTooltip: 'diff-tooltip',
    diffTooltipDot: 'diff-tooltip-dot',
    diffTooltipLabel: 'diff-tooltip-label',
    diffTooltipRep: 'diff-tooltip-rep',
  };

  if (typeof document === 'undefined') return;

  function queryElements() {
    const els = {};
    Object.entries(ELEMENT_ID_MAP).forEach(([key, id]) => {
      els[key] = document.getElementById(id);
    });
    els.filePickerBtn = document.querySelector('.file-picker-btn');
    els.modeButtons = Array.from(document.querySelectorAll('.segmented-tab[data-mode]'));
    els.entityCheckboxes = Array.from(document.querySelectorAll('#entity-toggles input[type="checkbox"]'));
    els.stepperSteps = Array.from(document.querySelectorAll('#sanitizer-stepper .stepper-step'));
    return els;
  }

  function createInitialState() {
    return {
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
  }

  function countLines(text) {
    const chars = text.length;
    if (chars === 0) return 0;
    let lines = 1;
    for (let i = 0; i < chars; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 10) {
        lines++;
      } else if (ch === 13) {
        lines++;
        if (i + 1 < chars && text.charCodeAt(i + 1) === 10) i++;
      }
    }
    return lines;
  }

  function hasAllowedExtension(name) {
    const lower = String(name || '').toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function showInputError(ctx, message) {
    if (ctx.els.inputErrorBanner && ctx.els.inputErrorText) {
      ctx.els.inputErrorText.textContent = message;
      ctx.els.inputErrorBanner.hidden = false;
    }
    ctx.UI.showToast(message, 'error');
  }

  function clearInputError(ctx) {
    if (ctx.els.inputErrorBanner) ctx.els.inputErrorBanner.hidden = true;
  }

  function updateStepper(ctx, hasInput) {
    if (!ctx.els.stepperSteps.length) return;
    ctx.els.stepperSteps.forEach((stepEl, idx) => {
      stepEl.classList.remove('is-active', 'is-complete');
      if (!hasInput) {
        if (idx === 0) stepEl.classList.add('is-active');
      } else if (ctx.state.hasExportedCurrent) {
        stepEl.classList.add(idx < 3 ? 'is-complete' : 'is-active');
      } else {
        if (idx < 2) stepEl.classList.add('is-complete');
        else if (idx === 2) stepEl.classList.add('is-active');
      }
    });
  }

  function handlePaneScroll(syncState, source, target) {
    if (syncState.isSyncing && syncState.activeSource !== source) return;
    syncState.isSyncing = true;
    syncState.activeSource = source;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    if (syncState.rafId) cancelAnimationFrame(syncState.rafId);
    syncState.rafId = requestAnimationFrame(() => {
      syncState.isSyncing = false;
      syncState.activeSource = null;
      syncState.rafId = 0;
    });
  }

  function positionDiffTooltip(els, target) {
    const rect = target.getBoundingClientRect();
    const tipRect = els.diffTooltip.getBoundingClientRect();
    let top = rect.top - tipRect.height - TOOLTIP_MARGIN_PX;
    if (top < TOOLTIP_MARGIN_PX) top = rect.bottom + TOOLTIP_MARGIN_PX;
    const vw = window.innerWidth || FALLBACK_VIEWPORT_WIDTH;
    const rawLeft = rect.left + (rect.width - tipRect.width) / 2;
    const left = Math.max(TOOLTIP_VIEWPORT_PAD_PX, Math.min(rawLeft, vw - tipRect.width - TOOLTIP_VIEWPORT_PAD_PX));
    els.diffTooltip.style.top = `${Math.round(top)}px`;
    els.diffTooltip.style.left = `${Math.round(left)}px`;
  }

  function showDiffTooltip(ctx, target) {
    const { els, tooltipState } = ctx;
    if (!els.diffTooltip || typeof target.getBoundingClientRect !== 'function') return;
    const label = target.getAttribute('data-label');
    const rep = target.getAttribute('data-rep');
    const group = target.getAttribute('data-group');
    if (!label || rep === null) return;

    if (target.hasAttribute('title')) {
      target.setAttribute('data-native-title', target.getAttribute('title'));
      target.removeAttribute('title');
    }
    tooltipState.activeHoverEl = target;
    if (els.diffTooltipDot) els.diffTooltipDot.className = `entity-dot entity-dot-${group || 'EMAIL'}`;
    if (els.diffTooltipLabel) els.diffTooltipLabel.textContent = label;
    if (els.diffTooltipRep) els.diffTooltipRep.textContent = rep;
    els.diffTooltip.hidden = false;
    positionDiffTooltip(els, target);
  }

  function hideDiffTooltip(ctx) {
    const { els, tooltipState } = ctx;
    if (tooltipState.activeHoverEl && tooltipState.activeHoverEl.hasAttribute('data-native-title')) {
      tooltipState.activeHoverEl.setAttribute('title', tooltipState.activeHoverEl.getAttribute('data-native-title'));
      tooltipState.activeHoverEl.removeAttribute('data-native-title');
    }
    tooltipState.activeHoverEl = null;
    if (els.diffTooltip) els.diffTooltip.hidden = true;
  }

  function updateInputMeta(ctx, text) {
    if (!ctx.els.inputMeta) return;
    const csvTag = ctx.state.isCsv ? ' · CSV-Aware' : '';
    ctx.els.inputMeta.textContent = `${ctx.UI.formatNumber(text.length)} characters · ${ctx.UI.formatNumber(countLines(text))} lines${csvTag}`;
  }

  function renderStats(ctx, stats) {
    const { els, UI } = ctx;
    const mapping = [
      [els.statTotal, stats.total],
      [els.statEmail, stats.EMAIL],
      [els.statPhone, stats.PHONE],
      [els.statIp, stats.IP],
      [els.statPan, stats.PAN],
      [els.statAadhaar, stats.AADHAAR],
      [els.statCard, stats.CREDIT_CARD],
      [els.statLuhnRejected, stats.luhnRejectedCount],
    ];
    mapping.forEach(([el, value]) => {
      if (el) el.textContent = UI.formatNumber(value);
    });
  }

  function createMappingRow(UI, entry) {
    const pill = UI.createEl('span', {
      className: 'mapping-type-pill',
      children: [
        UI.createEl('span', { className: `entity-dot entity-dot-${entry.entityGroup}` }),
        document.createTextNode(entry.entityTypeLabel),
      ],
    });
    return UI.createEl('tr', {
      children: [
        UI.createEl('td', { text: entry.placeholder }),
        UI.createEl('td', { children: [pill] }),
        UI.createEl('td', { text: entry.originalSample }),
        UI.createEl('td', { text: String(entry.count) }),
      ],
    });
  }

  function renderMappingTable(ctx, mappings) {
    const { els, UI, state } = ctx;
    if (els.mapCountBadge) els.mapCountBadge.textContent = UI.formatNumber(mappings.length);
    if (!els.mappingEmptyState || !els.mappingTableWrap || !els.mappingTbody) return;

    if (state.mode !== 'pseudonym' || mappings.length === 0) {
      els.mappingEmptyState.hidden = false;
      els.mappingTableWrap.hidden = true;
      UI.clearChildren(els.mappingTbody);
      return;
    }

    els.mappingEmptyState.hidden = true;
    els.mappingTableWrap.hidden = false;

    const frag = document.createDocumentFragment();
    const count = Math.min(mappings.length, MAX_MAPPING_ROWS);
    for (let i = 0; i < count; i++) frag.appendChild(createMappingRow(UI, mappings[i]));

    if (mappings.length > MAX_MAPPING_ROWS) {
      const moreCell = UI.createEl('td', {
        attrs: { colspan: '4' },
        text: `Showing first ${MAX_MAPPING_ROWS} of ${UI.formatNumber(mappings.length)} unique placeholders.`,
      });
      frag.appendChild(UI.createEl('tr', { children: [moreCell] }));
    }
    UI.clearChildren(els.mappingTbody);
    els.mappingTbody.appendChild(frag);
  }

  function renderEmptyResult(ctx) {
    const { els, Engine, UI, state } = ctx;
    const emptyResult = Engine.sanitizeInput('', {
      mode: state.mode,
      strictVerhoeff: state.strictVerhoeff,
      isCsv: state.isCsv,
      enabledEntities: state.enabledEntities,
    });
    state.lastSanitizedText = '';
    state.lastStats = emptyResult.stats;
    state.hasExportedCurrent = false;
    renderStats(ctx, emptyResult.stats);
    renderMappingTable(ctx, []);
    updateStepper(ctx, false);

    if (els.largeInputNotice) els.largeInputNotice.hidden = true;
    if (els.originalEmpty) els.originalEmpty.hidden = false;
    if (els.originalDiffContent) {
      els.originalDiffContent.hidden = true;
      UI.clearChildren(els.originalDiffContent);
    }
    if (els.sanitizedEmpty) els.sanitizedEmpty.hidden = false;
    if (els.sanitizedDiffContent) {
      els.sanitizedDiffContent.hidden = true;
      UI.clearChildren(els.sanitizedDiffContent);
    }
    if (els.originalPaneMeta) els.originalPaneMeta.textContent = '0 chars · 0 matches';
    if (els.sanitizedPaneMeta) els.sanitizedPaneMeta.textContent = '0 chars';
    if (els.copyBtn) els.copyBtn.disabled = true;
    if (els.downloadBtn) els.downloadBtn.disabled = true;
  }

  function renderNonEmptyResult(ctx, res, rawLength) {
    const { els, Engine, UI, state } = ctx;
    state.lastSanitizedText = res.sanitizedText;
    state.lastStats = res.stats;
    renderStats(ctx, res.stats);
    renderMappingTable(ctx, res.mappings);
    updateStepper(ctx, true);

    if (els.largeInputNotice && els.largeInputNoticeText) {
      els.largeInputNotice.hidden = !res.truncatedPreview;
      if (res.truncatedPreview) {
        els.largeInputNoticeText.textContent =
          `Large input (${UI.formatNumber(rawLength)} chars): visual diff preview capped at first ` +
          `${UI.formatNumber(Engine.LARGE_PREVIEW_CHAR_LIMIT)} characters. Copy & Download include the complete sanitized output.`;
      }
    }
    if (els.originalPaneMeta) els.originalPaneMeta.textContent = `${UI.formatNumber(rawLength)} chars · ${UI.formatNumber(res.stats.total)} matches`;
    if (els.sanitizedPaneMeta) els.sanitizedPaneMeta.textContent = `${UI.formatNumber(res.sanitizedText.length)} chars`;

    if (els.originalEmpty) els.originalEmpty.hidden = true;
    if (els.originalDiffContent) {
      els.originalDiffContent.hidden = false;
      els.originalDiffContent.innerHTML = res.originalHtml;
    }
    if (els.sanitizedEmpty) els.sanitizedEmpty.hidden = true;
    if (els.sanitizedDiffContent) {
      els.sanitizedDiffContent.hidden = false;
      els.sanitizedDiffContent.innerHTML = res.sanitizedHtml;
    }
    if (els.copyBtn) els.copyBtn.disabled = false;
    if (els.downloadBtn) els.downloadBtn.disabled = false;
  }

  function processAndRender(ctx) {
    const text = ctx.els.rawInput.value;
    updateInputMeta(ctx, text);
    if (ctx.els.activeModeBadge) ctx.els.activeModeBadge.textContent = MODE_LABELS[ctx.state.mode];

    if (!/\S/.test(text)) {
      renderEmptyResult(ctx);
      return null;
    }

    const res = ctx.Engine.sanitizeInput(text, {
      mode: ctx.state.mode,
      strictVerhoeff: ctx.state.strictVerhoeff,
      isCsv: ctx.state.isCsv,
      enabledEntities: ctx.state.enabledEntities,
      previewLimit: ctx.Engine.LARGE_PREVIEW_CHAR_LIMIT,
    });
    renderNonEmptyResult(ctx, res, text.length);
    return res;
  }

  function processImmediately(ctx) {
    if (ctx.state.debounceTimer) {
      clearTimeout(ctx.state.debounceTimer);
      ctx.state.debounceTimer = 0;
    }
    return processAndRender(ctx);
  }

  function scheduleProcess(ctx) {
    ctx.state.hasExportedCurrent = false;
    clearInputError(ctx);
    if (ctx.state.debounceTimer) clearTimeout(ctx.state.debounceTimer);
    const len = ctx.els.rawInput.value.length;
    const delay =
      len > LARGE_DEBOUNCE_THRESHOLD
        ? LARGE_DEBOUNCE_MS
        : len > MEDIUM_DEBOUNCE_THRESHOLD
          ? DEBOUNCE_MS
          : FAST_DEBOUNCE_MS;
    ctx.state.debounceTimer = setTimeout(() => {
      ctx.state.debounceTimer = 0;
      processAndRender(ctx);
    }, delay);
  }

  function clearLoadedFile(ctx, clearTextToo, showToastMsg) {
    const { els, state, Stats, UI } = ctx;
    state.loadedFileName = null;
    state.loadedFileSize = 0;
    if (els.fileChip) els.fileChip.hidden = true;
    if (els.fileName) els.fileName.textContent = '';
    if (els.fileSize) els.fileSize.textContent = '';
    if (els.fileInput) els.fileInput.value = '';
    clearInputError(ctx);
    if (!clearTextToo) return;

    els.rawInput.value = '';
    state.isCsv = false;
    if (els.csvModeToggle) els.csvModeToggle.checked = false;
    state.hasExportedCurrent = false;
    if (Stats) Stats.clearSessionFingerprint();
    processImmediately(ctx);
    if (showToastMsg) UI.showToast('Workspace cleared', 'info');
  }

  function applyLoadedFileContent(ctx, file, content) {
    const { els, state, Stats, UI } = ctx;
    if (content.indexOf('\u0000') !== -1) {
      showInputError(ctx, `File "${file.name}" appears to contain binary data and cannot be sanitized as text or CSV.`);
      if (els.fileInput) els.fileInput.value = '';
      return;
    }
    if (!/\S/.test(content)) {
      showInputError(ctx, `File "${file.name}" contains only whitespace.`);
      return;
    }

    const isCsvFile = file.name.toLowerCase().endsWith('.csv');
    state.loadedFileName = file.name;
    state.loadedFileSize = file.size;
    state.isCsv = isCsvFile;
    state.hasExportedCurrent = false;

    if (els.csvModeToggle) els.csvModeToggle.checked = isCsvFile;
    if (els.fileName) els.fileName.textContent = file.name;
    if (els.fileSize) els.fileSize.textContent = UI.formatBytes(file.size);
    if (els.fileChip) els.fileChip.hidden = false;

    els.rawInput.value = content;
    const res = processImmediately(ctx);
    if (Stats && res) Stats.recordRun({ text: content, stats: res.stats, sourceType: 'file' });
    UI.showToast(`Loaded ${file.name} (${UI.formatBytes(file.size)})`, 'success');
  }

  function loadFile(ctx, file) {
    const { els, UI } = ctx;
    if (!file) return;
    clearInputError(ctx);

    if (!hasAllowedExtension(file.name)) {
      showInputError(ctx, `Unsupported file "${file.name}". Please upload a .txt or .csv file.`);
      if (els.fileInput) els.fileInput.value = '';
      return;
    }
    if (file.size === 0) {
      showInputError(ctx, `File "${file.name}" is empty (0 bytes).`);
      if (els.fileInput) els.fileInput.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showInputError(ctx, `File "${file.name}" (${UI.formatBytes(file.size)}) exceeds the ${UI.formatBytes(MAX_FILE_SIZE_BYTES)} browser upload limit.`);
      if (els.fileInput) els.fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => showInputError(ctx, `Could not read "${file.name}". Check file permissions and try again.`);
    reader.onload = () => applyLoadedFileContent(ctx, file, typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  }

  function setMappingDrawerOpen(ctx, open, restoreFocus) {
    const { els, state } = ctx;
    state.mapOpen = open;
    if (els.mappingDrawer) els.mappingDrawer.hidden = !open;
    if (els.toggleMapBtn) els.toggleMapBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && els.mappingDrawer && typeof els.mappingDrawer.focus === 'function') {
      els.mappingDrawer.focus();
    } else if (!open && restoreFocus && els.toggleMapBtn && typeof els.toggleMapBtn.focus === 'function') {
      els.toggleMapBtn.focus();
    }
  }

  function showCopyConfirmation(ctx) {
    const { els, state, UI } = ctx;
    if (state.copyFeedbackTimer) clearTimeout(state.copyFeedbackTimer);
    if (els.copyBtn) els.copyBtn.classList.add('is-copied');
    if (els.copyBtnLabel) els.copyBtnLabel.textContent = 'Copied!';
    UI.showToast('Sanitized output copied to clipboard', 'success');
    state.copyFeedbackTimer = setTimeout(() => {
      if (els.copyBtn) els.copyBtn.classList.remove('is-copied');
      if (els.copyBtnLabel) els.copyBtnLabel.textContent = 'Copy Sanitized';
      state.copyFeedbackTimer = 0;
    }, COPY_FEEDBACK_MS);
  }

  function fallbackCopyText(ctx, text) {
    const ta = ctx.UI.createEl('textarea', { className: 'sr-only', attrs: { readonly: '' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {
      // Fallback when document.execCommand('copy') is denied by the browser
      ok = false;
    }
    document.body.removeChild(ta);
    if (ok) showCopyConfirmation(ctx);
    else ctx.UI.showToast('Clipboard blocked by browser; use Download instead', 'error');
  }

  function recordExportRun(ctx) {
    ctx.state.hasExportedCurrent = true;
    updateStepper(ctx, true);
    if (ctx.Stats && ctx.state.lastStats) {
      ctx.Stats.recordRun({ text: ctx.els.rawInput.value, stats: ctx.state.lastStats, sourceType: 'export' });
    }
  }

  function copySanitizedText(ctx) {
    const output = ctx.state.lastSanitizedText;
    if (!output) return;
    recordExportRun(ctx);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(output).then(() => showCopyConfirmation(ctx), () => fallbackCopyText(ctx, output));
      return;
    }
    fallbackCopyText(ctx, output);
  }

  function downloadSanitizedFile(ctx) {
    const output = ctx.state.lastSanitizedText;
    if (!output) return;
    recordExportRun(ctx);
    const filename = ctx.Engine.buildDownloadFilename(ctx.state.loadedFileName, ctx.state.isCsv);
    const mime = ctx.state.isCsv ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8';
    const url = URL.createObjectURL(new Blob([output], { type: mime }));
    const a = ctx.UI.createEl('a', { attrs: { href: url, download: filename } });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS);
    ctx.UI.showToast(`Downloaded ${filename}`, 'success');
  }

  function bindDiffAndTooltipEvents(ctx) {
    const { els, syncState } = ctx;
    if (els.originalDiffPane && els.sanitizedDiffPane) {
      els.originalDiffPane.addEventListener('scroll', () => {
        hideDiffTooltip(ctx);
        handlePaneScroll(syncState, els.originalDiffPane, els.sanitizedDiffPane);
      });
      els.sanitizedDiffPane.addEventListener('scroll', () => {
        hideDiffTooltip(ctx);
        handlePaneScroll(syncState, els.sanitizedDiffPane, els.originalDiffPane);
      });
    }
    if (!els.diffGrid) return;
    els.diffGrid.addEventListener('mouseover', (e) => {
      const target = e.target && typeof e.target.closest === 'function' ? e.target.closest('.pii-mark, .sanitized-token') : null;
      if (target) showDiffTooltip(ctx, target);
    });
    els.diffGrid.addEventListener('mouseout', (e) => {
      if (!ctx.tooltipState.activeHoverEl) return;
      const related = e.relatedTarget;
      if (related && ctx.tooltipState.activeHoverEl.contains && ctx.tooltipState.activeHoverEl.contains(related)) return;
      hideDiffTooltip(ctx);
    });
  }

  function bindFileEvents(ctx) {
    const { els, state } = ctx;
    if (els.fileInput) {
      els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) loadFile(ctx, file);
      });
    }
    if (els.filePickerBtn && els.fileInput) {
      els.filePickerBtn.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        els.fileInput.click();
      });
    }
    if (els.fileClearBtn) els.fileClearBtn.addEventListener('click', () => clearLoadedFile(ctx, true, true));
    if (!els.dropZone) return;

    els.dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      state.dragDepth += 1;
      els.dropZone.classList.add('is-drag-over');
    });
    els.dropZone.addEventListener('dragover', (e) => e.preventDefault());
    els.dropZone.addEventListener('dragleave', () => {
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (state.dragDepth === 0) els.dropZone.classList.remove('is-drag-over');
    });
    els.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      state.dragDepth = 0;
      els.dropZone.classList.remove('is-drag-over');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadFile(ctx, file);
    });
  }

  function handleModeSelection(ctx, btn) {
    const nextMode = btn.getAttribute('data-mode');
    if (!nextMode || nextMode === ctx.state.mode) return;
    ctx.state.mode = nextMode;
    ctx.state.hasExportedCurrent = false;
    ctx.els.modeButtons.forEach((b) => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    processImmediately(ctx);
  }

  function handleModeKeydown(ctx, e, idx) {
    const count = ctx.els.modeButtons.length;
    let targetIdx = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') targetIdx = (idx + 1) % count;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') targetIdx = (idx - 1 + count) % count;
    if (targetIdx === -1) return;
    e.preventDefault();
    const nextBtn = ctx.els.modeButtons[targetIdx];
    if (typeof nextBtn.focus === 'function') nextBtn.focus();
    nextBtn.click();
  }

  function bindInputAndModeEvents(ctx) {
    const { els, state, Engine, Stats, UI } = ctx;
    els.rawInput.addEventListener('input', () => scheduleProcess(ctx));
    if (els.loadSampleBtn) {
      els.loadSampleBtn.addEventListener('click', () => {
        clearLoadedFile(ctx, false, false);
        state.isCsv = false;
        if (els.csvModeToggle) els.csvModeToggle.checked = false;
        state.hasExportedCurrent = false;
        els.rawInput.value = Engine.SAMPLE_TEXT;
        const res = processImmediately(ctx);
        if (Stats && res) Stats.recordRun({ text: Engine.SAMPLE_TEXT, stats: res.stats, sourceType: 'sample' });
        UI.showToast('Sample noisy dataset loaded locally', 'success');
      });
    }
    if (els.clearBtn) els.clearBtn.addEventListener('click', () => clearLoadedFile(ctx, true, true));
    if (els.actionClearBtn) els.actionClearBtn.addEventListener('click', () => clearLoadedFile(ctx, true, true));
    els.modeButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => handleModeSelection(ctx, btn));
      btn.addEventListener('keydown', (e) => handleModeKeydown(ctx, e, idx));
    });
  }

  function bindToggleAndExportEvents(ctx) {
    const { els, state } = ctx;
    if (els.csvModeToggle) {
      els.csvModeToggle.addEventListener('change', () => {
        state.isCsv = els.csvModeToggle.checked;
        state.hasExportedCurrent = false;
        processImmediately(ctx);
      });
    }
    if (els.strictVerhoeffToggle) {
      els.strictVerhoeffToggle.addEventListener('change', () => {
        state.strictVerhoeff = els.strictVerhoeffToggle.checked;
        state.hasExportedCurrent = false;
        processImmediately(ctx);
      });
    }
    els.entityCheckboxes.forEach((cb) => {
      cb.addEventListener('change', () => {
        const entity = cb.getAttribute('data-entity');
        if (!entity) return;
        state.enabledEntities[entity] = cb.checked;
        state.hasExportedCurrent = false;
        processImmediately(ctx);
      });
    });
    if (els.toggleMapBtn) els.toggleMapBtn.addEventListener('click', () => setMappingDrawerOpen(ctx, !state.mapOpen, false));
    if (els.closeMapBtn) els.closeMapBtn.addEventListener('click', () => setMappingDrawerOpen(ctx, false, true));
    if (els.copyBtn) els.copyBtn.addEventListener('click', () => copySanitizedText(ctx));
    if (els.downloadBtn) els.downloadBtn.addEventListener('click', () => downloadSanitizedFile(ctx));
  }

  function initSanitizerController() {
    const Engine = window.RedactEngine;
    const UI = window.RedactUI;
    const Stats = window.RedactStats;
    const els = queryElements();
    if (!Engine || !UI || !els.rawInput) return;

    const ctx = {
      Engine,
      UI,
      Stats,
      els,
      state: createInitialState(),
      syncState: { isSyncing: false, activeSource: null, rafId: 0 },
      tooltipState: { activeHoverEl: null },
    };

    bindDiffAndTooltipEvents(ctx);
    bindFileEvents(ctx);
    bindInputAndModeEvents(ctx);
    bindToggleAndExportEvents(ctx);
    processImmediately(ctx);
  }

  document.addEventListener('DOMContentLoaded', initSanitizerController);
})();
