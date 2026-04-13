const SHIFT_TARGET_HOURS = 9;
const SHIFT_TARGET_MS = SHIFT_TARGET_HOURS * 60 * 60 * 1000;
const WORK_TARGET_HOURS = 8;
const WORK_TARGET_MS = WORK_TARGET_HOURS * 60 * 60 * 1000;
const BREAK_TARGET_MS = 60 * 60 * 1000;
const HISTORY_KEY = 'ninetofive-single-history';

const SAMPLE_DATA = `10-Apr-26    09:02 AM    In    HQ-1
10-Apr-26    12:08 PM    Out   HQ-1
10-Apr-26    12:47 PM    In    HQ-1
10-Apr-26    18:05 PM    Out   HQ-1`;

const monthMap = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const state = {
  rawInput: '',
  entries: [],
  segments: [],
  metrics: null,
  warnings: [],
  hints: [],
  historyMap: {},
  historyList: [],
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  bindEvents();
  loadHistory();
  renderAll();
});

function cacheDom() {
  els.logInput = document.getElementById('logInput');
  els.hintStrip = document.getElementById('hintStrip');
  els.metricsGrid = document.getElementById('metricsGrid');
  els.statusChips = document.getElementById('statusChips');
  els.timelineList = document.getElementById('timelineList');
  els.timelineInfo = document.getElementById('timelineInfo');
  els.progressBar = document.getElementById('progressBar');
  els.progressValue = document.getElementById('progressValue');
  els.dayLabel = document.getElementById('dayLabel');
  els.summaryMessage = document.getElementById('summaryMessage');
  els.expectedRow = document.getElementById('expectedRow');
  els.historySelect = document.getElementById('historySelect');
  els.logInput.addEventListener('input', debounce(handleInputChange, 200));

  els.pasteBtn = document.getElementById('pasteBtn');
  els.sampleBtn = document.getElementById('sampleBtn');
  els.clearBtn = document.getElementById('clearBtn');
  els.copySummaryBtn = document.getElementById('copySummaryBtn');
}

function bindEvents() {
  els.pasteBtn.addEventListener('click', async () => {
    if (!navigator.clipboard) {
      pushInfo('Clipboard access unavailable.');
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      els.logInput.value = text;
      processInput(text, 'clipboard');
    } catch (error) {
      pushWarning('Unable to read clipboard data.');
    }
  });

  els.sampleBtn.addEventListener('click', () => {
    els.logInput.value = SAMPLE_DATA;
    processInput(SAMPLE_DATA, 'sample');
  });

  els.clearBtn.addEventListener('click', resetApp);

  els.copySummaryBtn.addEventListener('click', copySummary);

  els.historySelect.addEventListener('change', (event) => {
    const key = event.target.value;
    if (!key) return;
    const record = state.historyMap[key];
    if (record) {
      els.logInput.value = record.raw;
      processInput(record.raw, 'history');
    }
  });
}

function handleInputChange(e) {
  processInput(e.target.value, 'typing');
}

function processInput(raw, source = 'manual') {
  state.rawInput = raw;
  if (!raw.trim()) {
    state.entries = [];
    state.segments = [];
    state.metrics = null;
    state.warnings = [];
    state.hints = ['Waiting for data…'];
    renderAll();
    return;
  }
  const result = analyze(raw);
  state.entries = result.entries;
  state.segments = result.segments;
  state.metrics = result.metrics;
  state.warnings = result.warnings;
  state.hints = result.hints;
  if (result.metrics && result.metrics.dayKey) {
    persistHistory(result.metrics.dayKey, result.metrics.dayLabel, raw);
  }
  renderAll();
}

function analyze(raw) {
  const parseResult = parseRawInput(raw);
  const dayResult = restrictToSingleDay(parseResult.entries);
  const segmentResult = buildSegments(dayResult.entries);
  const metrics = buildMetrics(segmentResult.segments, dayResult.entries.length, segmentResult.ongoing);
  const warnings = [...parseResult.warnings, ...dayResult.warnings, ...segmentResult.warnings];
  const hints = metrics ? [`Parsed ${metrics.eventCount} punch${metrics.eventCount === 1 ? '' : 'es'}.`] : ['No valid punches detected.'];
  return {
    entries: dayResult.entries,
    segments: segmentResult.segments,
    metrics,
    warnings,
    hints,
  };
}

function parseRawInput(raw) {
  const lines = raw.replace(/\r/g, '').split('\n');
  const entries = [];
  const warnings = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const normalized = trimmed.replace(/\s+/g, ' ');
    const entry = parseLine(normalized, index + 1);
    if (!entry) {
      warnings.push(`Line ${index + 1} skipped (missing date/time/In-Out).`);
      return;
    }
    entries.push(entry);
  });

  entries.sort((a, b) => a.timestamp - b.timestamp);

  return { entries, warnings };
}

function parseLine(line, lineNumber) {
  const combinedRegex = /(\d{1,2}[-\/][A-Za-z]{3}[-\/]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(AM|PM)?/i;
  const match = line.match(combinedRegex);
  if (!match) return null;
  const [, dateStr, timeStr, meridian] = match;
  const actionMatch = line.match(/\b(in|out)\b/i);
  if (!actionMatch) return null;
  const type = actionMatch[1].toLowerCase();
  const timestamp = buildDate(dateStr, timeStr, meridian);
  if (!timestamp) return null;
  return {
    id: `${lineNumber}-${type}-${Math.random().toString(16).slice(2, 6)}`,
    lineNumber,
    raw: line,
    type,
    timestamp,
    inferred: false,
  };
}

function buildDate(dateStr, timeStr, meridian) {
  const [dayToken, monthToken, yearToken] = dateStr.split(/[-\/]/);
  const monthIndex = monthMap[monthToken.toLowerCase()];
  if (monthIndex === undefined) return null;
  let year = parseInt(yearToken, 10);
  if (year < 100) year += 2000;
  const { hour, minute, second } = parseTime(timeStr, meridian);
  if ([hour, minute, second].some((n) => Number.isNaN(n))) return null;
  return new Date(year, monthIndex, parseInt(dayToken, 10), hour, minute, second || 0);
}

function parseTime(timeStr, meridianFromRegex) {
  const clean = timeStr.replace(/[^0-9:amp]/gi, '');
  const meridian =
    meridianFromRegex ||
    (clean.toLowerCase().includes('am') ? 'AM' : clean.toLowerCase().includes('pm') ? 'PM' : null);
  const numeric = clean.replace(/am|pm/gi, '');
  const [h = '0', m = '0', s = '0'] = numeric.split(':');
  let hour = parseInt(h, 10);
  const minute = parseInt(m, 10) || 0;
  const second = parseInt(s, 10) || 0;
  if (meridian) {
    if (meridian.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (meridian.toUpperCase() === 'AM' && hour === 12) hour = 0;
  }
  return { hour, minute, second };
}

function restrictToSingleDay(entries) {
  if (!entries.length) return { entries, warnings: [] };
  const firstKey = formatDateKey(entries[0].timestamp);
  const filtered = entries.filter((entry) => formatDateKey(entry.timestamp) === firstKey);
  const warnings = [];
  if (filtered.length !== entries.length) {
    warnings.push('Only the first day of entries was analyzed.');
  }
  return { entries: filtered, warnings };
}

function buildSegments(entries) {
  const segments = [];
  const warnings = [];
  let openIn = null;
  let ongoingSegment = null;

  entries.forEach((entry) => {
    if (entry.type === 'in') {
      if (openIn) {
        warnings.push(`In at line ${entry.lineNumber} arrived before an Out; closing previous shift.`);
        segments.push({ in: openIn, out: { ...entry, type: 'out', inferred: true, timestamp: entry.timestamp }, ongoing: false });
      }
      openIn = entry;
      return;
    }

    if (!openIn) {
      warnings.push(`Out at line ${entry.lineNumber} has no matching In.`);
      return;
    }

    segments.push({ in: openIn, out: entry, ongoing: false });
    openIn = null;
  });

  if (openIn) {
    const now = new Date();
    const expectedOut = new Date(openIn.timestamp.getTime() + SHIFT_TARGET_MS);
    const out = {
      ...openIn,
      type: 'out',
      inferred: true,
      timestamp: now,
    };
    ongoingSegment = { in: openIn, out, ongoing: true, expectedOut };
    segments.push(ongoingSegment);
  }

  return { segments, warnings, ongoing: ongoingSegment };
}

function buildMetrics(segments, entryCount, ongoingSegment) {
  if (!segments.length) return null;
  const dayDate = segments[0].in.timestamp;
  const totalWorked = segments.reduce((sum, seg) => sum + Math.max(0, seg.out.timestamp - seg.in.timestamp), 0);
  const totalBreak = segments.reduce((sum, seg, idx) => {
    if (idx === 0) return sum;
    const prev = segments[idx - 1];
    const gap = seg.in.timestamp - prev.out.timestamp;
    return gap > 0 ? sum + gap : sum;
  }, 0);
  const workDeltaMs = WORK_TARGET_MS - totalWorked;
  const breakDeltaMs = BREAK_TARGET_MS - totalBreak;
  const progress = Math.min(1, totalWorked / SHIFT_TARGET_MS);
  return {
    dayKey: formatDateKey(dayDate),
    dayLabel: formatDateLabel(dayDate),
    totalWorked,
    totalBreak,
    workDeltaMs,
    breakDeltaMs,
    progress,
    ongoing: Boolean(ongoingSegment),
    expectedOut: ongoingSegment ? ongoingSegment.expectedOut : null,
    eventCount: entryCount,
  };
}

function renderAll() {
  renderHints();
  renderMetrics();
  renderStatusChips();
  renderSummaryMessage();
  renderExpectedRow();
  renderTimeline();
  renderHistorySelect();
}

function renderHints() {
  els.hintStrip.textContent = state.hints.length ? state.hints.join(' · ') : 'Ready when you are.';
}

function renderMetrics() {
  els.metricsGrid.innerHTML = '';
  if (!state.metrics) {
    els.dayLabel.textContent = 'No data yet';
    els.progressBar.style.width = '0%';
    els.progressValue.textContent = `0 / ${SHIFT_TARGET_HOURS}h`;
    return;
  }

  const workInsight = describeWorkDelta(state.metrics);
  const breakInsight = describeBreakDelta(state.metrics);

  els.dayLabel.textContent = state.metrics.dayLabel;
  els.progressBar.style.width = `${(state.metrics.progress * 100).toFixed(1)}%`;
  els.progressValue.textContent = `${(state.metrics.progress * SHIFT_TARGET_HOURS).toFixed(1)} / ${SHIFT_TARGET_HOURS}h`;

  const cards = [
    { label: 'Total Worked', value: formatDuration(state.metrics.totalWorked), meta: workInsight.metaShort },
    { label: 'Work Status', value: workInsight.label, meta: workInsight.detail },
    { label: 'Total Break', value: formatDuration(state.metrics.totalBreak), meta: breakInsight.metaShort },
    { label: 'Break Status', value: breakInsight.label, meta: breakInsight.detail },
  ];

  cards.forEach((card) => {
    const node = document.createElement('div');
    node.className = 'metric-card';
    node.innerHTML = `<span>${card.label}</span><strong>${card.value}</strong>${card.meta ? `<small>${card.meta}</small>` : ''}`;
    els.metricsGrid.appendChild(node);
  });
}

function renderStatusChips() {
  els.statusChips.innerHTML = '';
  if (!state.rawInput.trim()) {
    els.statusChips.appendChild(createChip('Paste logs to begin', 'info'));
    return;
  }

  state.warnings.slice(0, 2).forEach((warning) => {
    els.statusChips.appendChild(createChip(warning, 'warning'));
  });

  if (!state.metrics) return;
  const workInsight = describeWorkDelta(state.metrics);
  const breakInsight = describeBreakDelta(state.metrics);
  const shiftChip = state.metrics.ongoing
    ? createChip('Shift in progress', 'warning')
    : createChip('Shift complete', state.metrics.workDeltaMs >= 0 ? 'info' : 'info');
  els.statusChips.appendChild(shiftChip);
  els.statusChips.appendChild(createChip(workInsight.label, workInsight.tone));
  els.statusChips.appendChild(createChip(breakInsight.label, breakInsight.tone));
}

function renderSummaryMessage() {
  if (!els.summaryMessage) return;
  if (!state.metrics) {
    els.summaryMessage.textContent = 'Paste a single day of punches to see totals, gaps, and friendly nudges.';
    return;
  }
  const workInsight = describeWorkDelta(state.metrics);
  const breakInsight = describeBreakDelta(state.metrics);
  const parts = [];
  if (state.metrics.ongoing && state.metrics.expectedOut) {
    parts.push(`Shift still running — expected completion around ${formatDateTime(state.metrics.expectedOut)}.`);
  } else if (!state.metrics.ongoing) {
    parts.push('Shift wrapped for the day.');
  }
  parts.push(workInsight.detail || workInsight.label);
  parts.push(breakInsight.detail || breakInsight.label);
  els.summaryMessage.textContent = parts.join(' ');
}

function renderExpectedRow() {
  if (!els.expectedRow) return;
  if (!state.metrics) {
    els.expectedRow.textContent = '';
    return;
  }
  if (state.metrics.ongoing && state.metrics.expectedOut) {
    els.expectedRow.innerHTML = `<strong>Ongoing shift</strong><span>Expected out ~ ${formatDateTime(state.metrics.expectedOut)}</span>`;
    return;
  }
  const status = state.metrics.workDeltaMs > 0
    ? `Needs ${formatDiff(state.metrics.workDeltaMs)} more work` :
      state.metrics.workDeltaMs < 0
        ? `Extra work logged: ${formatDiff(Math.abs(state.metrics.workDeltaMs))}`
        : 'Exactly 8h of focus logged';
  els.expectedRow.innerHTML = `<strong>Shift complete</strong><span>${status}</span>`;
}

function renderTimeline() {
  els.timelineList.innerHTML = '';
  if (!state.entries.length) {
    els.timelineInfo.textContent = 'No entries yet.';
    return;
  }
  els.timelineInfo.textContent = `${state.entries.length} punch${state.entries.length === 1 ? '' : 'es'}`;

  state.entries.forEach((entry) => {
    const item = document.createElement('li');
    item.dataset.type = entry.type;
    item.innerHTML = `<span>${entry.type === 'in' ? 'IN' : 'OUT'}</span><span>${formatTime(entry.timestamp)}</span>`;
    els.timelineList.appendChild(item);
  });

  if (state.metrics?.ongoing && state.metrics.expectedOut) {
    const item = document.createElement('li');
    item.dataset.type = 'out';
    item.dataset.ongoing = 'true';
    item.innerHTML = `<span>Expected OUT</span><span>${formatTime(state.metrics.expectedOut)}</span>`;
    els.timelineList.appendChild(item);
  }
}

function renderHistorySelect() {
  if (!els.historySelect) return;
  const active = state.metrics?.dayKey || '';
  const select = els.historySelect;
  const prevValue = select.value;
  select.innerHTML = '<option value="">History</option>';
  state.historyList.forEach((record) => {
    const option = document.createElement('option');
    option.value = record.dayKey;
    option.textContent = record.dayLabel;
    select.appendChild(option);
  });
  if (active) {
    select.value = active;
  } else if (prevValue && state.historyMap[prevValue]) {
    select.value = prevValue;
  } else {
    select.value = '';
  }
}

function copySummary() {
  if (!state.metrics) {
    pushInfo('Nothing to copy yet.');
    return;
  }
  const workInsight = describeWorkDelta(state.metrics);
  const breakInsight = describeBreakDelta(state.metrics);
  const expectedLine = state.metrics.ongoing && state.metrics.expectedOut
    ? `Expected out: ${formatDateTime(state.metrics.expectedOut)}`
    : 'Shift complete';
  const text = `NineToFive — ${state.metrics.dayLabel}\nWorked: ${formatDuration(state.metrics.totalWorked)}\nBreaks: ${formatDuration(state.metrics.totalBreak)}\n${workInsight.label}\n${breakInsight.label}\n${expectedLine}`;
  navigator.clipboard
    .writeText(text)
    .then(() => pushInfo('Summary copied.'))
    .catch(() => pushWarning('Clipboard copy failed.'));
}

function resetApp() {
  state.rawInput = '';
  state.entries = [];
  state.segments = [];
  state.metrics = null;
  state.warnings = [];
  state.hints = ['Cleared. Ready for new data.'];
  els.logInput.value = '';
  els.historySelect.value = '';
  renderAll();
}

function describeWorkDelta(metrics) {
  const diff = metrics.workDeltaMs;
  if (diff > 0) {
    const label = `Work left: ${formatDiff(diff)}`;
    const detail = `${label}. Apply for swipe correction in the SpineHR portal to complete the shift.`;
    return { label, detail, metaShort: 'Under 8h so far', tone: 'warning' };
  }
  if (diff < 0) {
    const extra = formatDiff(Math.abs(diff));
    return {
      label: `Extra work: ${extra}`,
      detail: `Extra work: ${extra}. Huge effort — thank you for grinding today!`,
      metaShort: 'Beyond 8h',
      tone: 'info',
    };
  }
  return {
    label: 'Exactly 8h logged',
    detail: "Exactly eight hours of work. Chef's kiss balance.",
    metaShort: 'Target met',
    tone: 'info',
  };
}

function describeBreakDelta(metrics) {
  const diff = metrics.breakDeltaMs;
  if (diff > 0) {
    const left = formatDiff(diff);
    const detail = metrics.ongoing
      ? `Break left: ${left}. Take a breather soon.`
      : `Break left: ${left}. You worked a little extra today!`;
    return { label: `Break left: ${left}`, detail, metaShort: 'Under 60m', tone: 'info' };
  }
  if (diff < 0) {
    const extra = formatDiff(Math.abs(diff));
    return {
      label: `Extra break: ${extra}`,
      detail: `Extra break: ${extra}. God is watching.`,
      metaShort: 'Over 60m',
      tone: 'warning',
    };
  }
  return {
    label: 'Break ≈ 60m',
    detail: 'Perfectly timed break — hydration masterclass.',
    metaShort: 'Spot on',
    tone: 'info',
  };
}

function createChip(text, tone = 'info') {
  const chip = document.createElement('span');
  chip.className = 'status-chip';
  chip.dataset.tone = tone;
  chip.textContent = text;
  return chip;
}

function loadHistory() {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    state.historyMap = stored ? JSON.parse(stored) : {};
  } catch (error) {
    state.historyMap = {};
  }
  state.historyList = Object.values(state.historyMap).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

function persistHistory(dayKey, dayLabel, raw) {
  if (!dayKey) return;
  const record = {
    dayKey,
    dayLabel,
    raw,
    savedAt: new Date().toISOString(),
  };
  state.historyMap = { ...state.historyMap, [dayKey]: record };
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.historyMap));
  } catch (error) {
    // ignore storage issues
  }
  state.historyList = Object.values(state.historyMap).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

function pushInfo(message) {
  state.hints = [message];
  renderHints();
}

function pushWarning(message) {
  state.warnings.unshift(message);
  renderStatusChips();
}

function debounce(fn, delay = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function formatDuration(ms) {
  if (!ms) return '0m';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.round((ms - hours * 60 * 60 * 1000) / (60 * 1000));
  if (!hours) return `${minutes}m`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatDiff(ms) {
  const minutesTotal = Math.max(0, Math.round(ms / (60 * 1000)));
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push('0m');
  return parts.join(' ');
}

function formatTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
