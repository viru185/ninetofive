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
  els.summaryMessage = document.getElementById('summaryMessage');
  els.insightGrid = document.getElementById('insightGrid');
  els.expectedRow = document.getElementById('expectedRow');
  els.segmentTrack = document.getElementById('segmentTrack');
  els.progressValue = document.getElementById('progressValue');
  els.progressBadges = document.getElementById('progressBadges');
  els.swipeNote = document.getElementById('swipeNote');
  els.statusChips = document.getElementById('statusChips');
  els.timelineList = document.getElementById('timelineList');
  els.timelineInfo = document.getElementById('timelineInfo');
  els.dayLabel = document.getElementById('dayLabel');
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
  const firstInEntry = dayResult.entries.find((entry) => entry.type === 'in') || null;
  const segmentResult = buildSegments(dayResult.entries);
  const metrics = buildMetrics(segmentResult.segments, dayResult.entries.length, firstInEntry);
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
    const inferredOut = {
      ...openIn,
      type: 'out',
      inferred: true,
      timestamp: now,
    };
    segments.push({ in: openIn, out: inferredOut, ongoing: true });
  }

  return { segments, warnings };
}

function buildMetrics(segments, entryCount, firstInEntry) {
  if (!segments.length || !firstInEntry) return null;
  const base = firstInEntry.timestamp;
  const totalWorked = segments.reduce((sum, seg) => sum + Math.max(0, seg.out.timestamp - seg.in.timestamp), 0);
  const totalBreak = segments.reduce((sum, seg, idx) => {
    if (idx === 0) return sum;
    const prev = segments[idx - 1];
    const gap = seg.in.timestamp - prev.out.timestamp;
    return gap > 0 ? sum + gap : sum;
  }, 0);

  const stateFlag = segments.some((seg) => seg.ongoing) ? 'incomplete' : 'complete';
  const progressSegments = buildProgressSegments(segments, base);
  const expectedOut = new Date(base.getTime() + SHIFT_TARGET_MS);

  return {
    dayKey: formatDateKey(base),
    dayLabel: formatDateLabel(base),
    totalWorked,
    totalBreak,
    workDeltaMs: WORK_TARGET_MS - totalWorked,
    breakDeltaMs: BREAK_TARGET_MS - totalBreak,
    progressSegments,
    state: stateFlag,
    firstIn: base,
    expectedOut,
    eventCount: entryCount,
  };
}

function buildProgressSegments(segments, baseline) {
  if (!baseline) return [];
  const baseMs = baseline.getTime();
  const items = [];
  segments.forEach((seg, idx) => {
    const start = Math.max(0, seg.in.timestamp.getTime() - baseMs);
    const end = Math.max(start, seg.out.timestamp.getTime() - baseMs);
    items.push({ type: 'work', startOffset: start, endOffset: end });
    if (idx < segments.length - 1) {
      const gapStart = end;
      const nextStart = Math.max(gapStart, segments[idx + 1].in.timestamp.getTime() - baseMs);
      if (nextStart > gapStart) {
        items.push({ type: 'break', startOffset: gapStart, endOffset: nextStart });
      }
    }
  });
  return items;
}

function renderAll() {
  renderHints();
  renderStatusChips();
  renderInsights();
  renderSummaryMessage();
  renderExpectedRow();
  renderProgress();
  renderSwipeNote();
  renderTimeline();
  renderHistorySelect();
}

function renderHints() {
  els.hintStrip.textContent = state.hints.length ? state.hints.join(' · ') : 'Ready when you are.';
}

function renderInsights() {
  els.insightGrid.innerHTML = '';
  if (!state.metrics) {
    els.dayLabel.textContent = 'No data yet';
    return;
  }
  els.dayLabel.textContent = state.metrics.dayLabel;
  const workStatus = getWorkStatus(state.metrics);
  const breakStatus = getBreakStatus(state.metrics);
  const cards = [
    {
      title: 'Work',
      total: formatDuration(state.metrics.totalWorked),
      status: workStatus.label,
    },
    {
      title: 'Break',
      total: formatDuration(state.metrics.totalBreak),
      status: breakStatus.label,
    },
  ];
  cards.forEach((card) => {
    const node = document.createElement('div');
    node.className = 'insight-card';
    node.innerHTML = `<span>${card.title}</span><strong>${card.total}</strong><small>${card.status}</small>`;
    els.insightGrid.appendChild(node);
  });
}

function renderStatusChips() {
  els.statusChips.innerHTML = '';
  state.warnings.slice(0, 2).forEach((warning) => {
    els.statusChips.appendChild(createChip(warning, 'warning'));
  });
  if (!state.metrics) {
    els.statusChips.appendChild(createChip('Paste logs to begin', 'info'));
    return;
  }
  const shiftTone = state.metrics.state === 'complete' ? 'info' : 'warning';
  els.statusChips.appendChild(createChip(state.metrics.state === 'complete' ? 'Completed shift' : 'Incomplete shift', shiftTone));
  if (state.metrics.state === 'incomplete' && state.metrics.expectedOut) {
    els.statusChips.appendChild(createChip(`Expected OUT ${formatTime(state.metrics.expectedOut)}`, 'info'));
  }
}

function renderSummaryMessage() {
  if (!els.summaryMessage) return;
  if (!state.metrics) {
    els.summaryMessage.textContent = 'Paste a single day of punches to see totals, gaps, and friendly nudges.';
    return;
  }
  const workStatus = getWorkStatus(state.metrics);
  const breakStatus = getBreakStatus(state.metrics);
  const parts = [];
  parts.push(state.metrics.state === 'complete' ? 'Shift complete.' : 'Shift is still running.');
  if (state.metrics.state === 'incomplete' && state.metrics.expectedOut) {
    parts.push(`Expected OUT around ${formatDateTime(state.metrics.expectedOut)}.`);
  }
  parts.push(workStatus.detail);
  parts.push(breakStatus.detail);
  els.summaryMessage.textContent = parts.join(' ');
}

function renderExpectedRow() {
  if (!els.expectedRow) return;
  if (!state.metrics) {
    els.expectedRow.textContent = '';
    return;
  }
  if (state.metrics.state === 'incomplete' && state.metrics.expectedOut) {
    els.expectedRow.innerHTML = `<strong>Ongoing shift</strong><span>Expected OUT ≈ ${formatDateTime(state.metrics.expectedOut)}</span>`;
    return;
  }
  const workStatus = getWorkStatus(state.metrics);
  els.expectedRow.innerHTML = `<strong>Shift summary</strong><span>${workStatus.label}</span>`;
}

function renderProgress() {
  if (!els.segmentTrack || !els.progressValue || !els.progressBadges) return;
  if (!state.metrics || !state.metrics.progressSegments.length) {
    els.segmentTrack.style.setProperty('--track-gradient', '');
    els.segmentTrack.dataset.gradient = 'false';
    els.segmentTrack.classList.remove('overrun');
    els.progressValue.textContent = '0h work · 0m break';
    els.progressBadges.innerHTML = '';
    return;
  }
  const gradient = buildSegmentGradient(state.metrics.progressSegments);
  if (gradient) {
    els.segmentTrack.style.setProperty('--track-gradient', gradient);
    els.segmentTrack.dataset.gradient = 'true';
  } else {
    els.segmentTrack.style.setProperty('--track-gradient', '');
    els.segmentTrack.dataset.gradient = 'false';
  }
  const workStatus = getWorkStatus(state.metrics);
  const breakStatus = getBreakStatus(state.metrics);
  els.segmentTrack.classList.toggle('overrun', state.metrics.totalWorked > SHIFT_TARGET_MS || state.metrics.totalBreak > BREAK_TARGET_MS);
  els.progressValue.textContent = `${formatDuration(state.metrics.totalWorked)} work · ${formatDuration(state.metrics.totalBreak)} break`;
  els.progressBadges.innerHTML = '';
  [workStatus.short, breakStatus.short]
    .filter(Boolean)
    .forEach((text) => {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = text;
      els.progressBadges.appendChild(badge);
    });
}

function buildSegmentGradient(segments) {
  if (!segments.length) return '';
  const pieces = [];
  segments.forEach((segment) => {
    const startPct = clamp((segment.startOffset / SHIFT_TARGET_MS) * 100, 0, 100);
    const endPct = clamp((segment.endOffset / SHIFT_TARGET_MS) * 100, 0, 100);
    if (endPct <= startPct) return;
    const color = segment.type === 'work' ? 'var(--accent)' : 'var(--accent-3)';
    pieces.push(`${color} ${startPct}% ${endPct}%`);
  });
  return pieces.join(', ');
}

function renderSwipeNote() {
  if (!els.swipeNote) return;
  els.swipeNote.textContent = '';
  if (!state.metrics) return;
  const workStatus = getWorkStatus(state.metrics);
  if (workStatus.swipe) {
    els.swipeNote.textContent = `Swipe reminder: ${workStatus.detail}`;
  }
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
  if (state.metrics?.state === 'incomplete' && state.metrics.expectedOut) {
    const item = document.createElement('li');
    item.dataset.type = 'out';
    item.dataset.ongoing = 'true';
    item.innerHTML = `<span>Expected OUT</span><span>${formatTime(state.metrics.expectedOut)}</span>`;
    els.timelineList.appendChild(item);
  }
}

function renderHistorySelect() {
  if (!els.historySelect) return;
  const select = els.historySelect;
  const active = state.metrics?.dayKey || '';
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
  const workStatus = getWorkStatus(state.metrics);
  const breakStatus = getBreakStatus(state.metrics);
  const expectedLine = state.metrics.state === 'incomplete' && state.metrics.expectedOut
    ? `Expected OUT: ${formatDateTime(state.metrics.expectedOut)}`
    : 'Shift complete';
  const text = `NineToFive — ${state.metrics.dayLabel}\nWork: ${formatDuration(state.metrics.totalWorked)} (${workStatus.label})\nBreak: ${formatDuration(state.metrics.totalBreak)} (${breakStatus.label})\n${workStatus.detail}\n${breakStatus.detail}\n${expectedLine}`;
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

function getWorkStatus(metrics) {
  const diff = metrics.workDeltaMs;
  const diffText = formatDiff(Math.abs(diff));
  if (metrics.state === 'incomplete') {
    if (diff > 0) {
      return {
        label: `Work left: ${diffText}`,
        detail: `${diffText} of work remaining — give OUT only after that.`,
        short: `Work −${diffText}`,
        tone: 'warning',
        swipe: false,
      };
    }
    if (diff < 0) {
      return {
        label: 'Already hit 8h',
        detail: `Required 8h already logged — feel free to wrap once you swipe.`,
        short: `Work done`,
        tone: 'info',
        swipe: false,
      };
    }
    return {
      label: 'Work target on point',
      detail: 'Exactly 8h logged. Swipe whenever ready.',
      short: 'Work exact',
      tone: 'info',
      swipe: false,
    };
  }
  if (diff > 0) {
    return {
      label: `Short by ${diffText}`,
      detail: `Apply for swipe correction in SpineHR for the missing ${diffText}.`,
      short: `Short ${diffText}`,
      tone: 'error',
      swipe: true,
    };
  }
  if (diff < 0) {
    return {
      label: `Extra work: ${diffText}`,
      detail: `Great job — ${diffText} beyond the required 8h.`,
      short: `Extra ${diffText}`,
      tone: 'info',
      swipe: false,
    };
  }
  return {
    label: 'Exactly 8h',
    detail: 'Perfect balance. Enjoy the rest of the day.',
    short: 'On target',
    tone: 'info',
    swipe: false,
  };
}

function getBreakStatus(metrics) {
  const diff = metrics.breakDeltaMs;
  const diffText = formatDiff(Math.abs(diff));
  if (metrics.state === 'incomplete') {
    if (diff > 0) {
      return {
        label: `Break left: ${diffText}`,
        detail: `Take ${diffText} more break time before signing off.`,
        short: `Break −${diffText}`,
        tone: 'info',
      };
    }
    if (diff < 0) {
      return {
        label: `Extra break: ${diffText}`,
        detail: `Extra break of ${diffText}. You must work beyond the 9h mark to cover it.`,
        short: `Break +${diffText}`,
        tone: 'warning',
      };
    }
    return {
      label: 'Break on track',
      detail: 'Breaks sitting right on the 60m target.',
      short: 'Break exact',
      tone: 'info',
    };
  }
  if (diff > 0) {
    return {
      label: `Short break: ${diffText}`,
      detail: `Took ${diffText} less — thanks for grinding a little extra.`,
      short: `Short break ${diffText}`,
      tone: 'info',
    };
  }
  if (diff < 0) {
    return {
      label: `Extra break: ${diffText}`,
      detail: `Extra break of ${diffText}. Hope HR lets you live!`,
      short: `Extra break ${diffText}`,
      tone: 'warning',
    };
  }
  return {
    label: 'Break ≈ 60m',
    detail: 'Perfectly timed break window.',
    short: 'Break on point',
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
    // storage full/blocked — silently ignore
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
