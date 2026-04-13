const SHIFT_TARGET_HOURS = 9;
const SHIFT_TARGET_MS = SHIFT_TARGET_HOURS * 60 * 60 * 1000;
const BREAK_TARGET_MS = 60 * 60 * 1000;

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
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  bindEvents();
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
      processInput(text);
    } catch (error) {
      pushWarning('Unable to read clipboard data.');
    }
  });

  els.sampleBtn.addEventListener('click', () => {
    els.logInput.value = SAMPLE_DATA;
    processInput(SAMPLE_DATA);
  });

  els.clearBtn.addEventListener('click', resetApp);

  els.copySummaryBtn.addEventListener('click', copySummary);
}

function handleInputChange(e) {
  processInput(e.target.value);
}

function processInput(raw) {
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
  renderAll();
}

function analyze(raw) {
  const parseResult = parseRawInput(raw);
  const dayResult = restrictToSingleDay(parseResult.entries);
  const segmentResult = buildSegments(dayResult.entries);
  const metrics = buildMetrics(segmentResult.segments, dayResult.entries.length);
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

  let ongoingSegment = null;
  if (openIn) {
    const now = new Date();
    const sameDay = formatDateKey(now) === formatDateKey(openIn.timestamp);
    const endTime = sameDay ? now : new Date(openIn.timestamp.getTime());
    const out = {
      ...openIn,
      type: 'out',
      inferred: true,
      timestamp: endTime,
    };
    ongoingSegment = { in: openIn, out, ongoing: true };
    segments.push(ongoingSegment);
  }

  return { segments, warnings, ongoing: ongoingSegment };
}

function buildMetrics(segments, entryCount) {
  if (!segments.length) return null;
  const dayDate = segments[0].in.timestamp;
  const totalWorked = segments.reduce((sum, seg) => sum + Math.max(0, seg.out.timestamp - seg.in.timestamp), 0);
  const totalBreak = segments.reduce((sum, seg, idx) => {
    if (idx === 0) return sum;
    const prev = segments[idx - 1];
    const gap = seg.in.timestamp - prev.out.timestamp;
    return gap > 0 ? sum + gap : sum;
  }, 0);
  const breakBadge = classifyBreak(totalBreak);
  const ongoing = segments[segments.length - 1].ongoing;
  const eventCount = entryCount;
  return {
    dayKey: formatDateKey(dayDate),
    dayLabel: formatDateLabel(dayDate),
    totalWorked,
    totalBreak,
    breakBadge,
    ongoing,
    ongoingEnd: ongoing ? segments[segments.length - 1].out.timestamp : null,
    progress: Math.min(1, totalWorked / SHIFT_TARGET_MS),
    eventCount,
  };
}

function classifyBreak(breakMs) {
  if (!breakMs) return { label: 'No breaks recorded', tone: 'info' };
  const delta = breakMs - BREAK_TARGET_MS;
  if (Math.abs(delta) <= 2 * 60 * 1000) {
    return { label: 'Break ≈ 1 hour', tone: 'info' };
  }
  if (delta > 0) return { label: 'Break > 1 hour', tone: 'warning' };
  return { label: 'Break < 1 hour', tone: 'info' };
}

function renderAll() {
  renderHints();
  renderMetrics();
  renderStatusChips();
  renderTimeline();
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

  els.dayLabel.textContent = state.metrics.dayLabel;
  els.progressBar.style.width = `${(state.metrics.progress * 100).toFixed(1)}%`;
  els.progressValue.textContent = `${(state.metrics.progress * SHIFT_TARGET_HOURS).toFixed(1)} / ${SHIFT_TARGET_HOURS}h`;

  const cards = [
    { label: 'Worked', value: formatDuration(state.metrics.totalWorked) },
    { label: 'Breaks', value: formatDuration(state.metrics.totalBreak) },
    { label: 'Break Signal', value: state.metrics.breakBadge.label },
    {
      label: 'Shift Status',
      value: state.metrics.ongoing ? 'In progress' : 'Complete',
      meta: state.metrics.ongoing && state.metrics.ongoingEnd ? `Ends approx ${formatTime(state.metrics.ongoingEnd)} (now)` : 'Ready',
    },
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
    const chip = createChip('Paste logs to begin', 'info');
    els.statusChips.appendChild(chip);
    return;
  }
  if (!state.warnings.length) {
    const tone = state.metrics?.ongoing ? 'warning' : 'info';
    const text = state.metrics?.ongoing ? 'Shift still running' : 'Looks good';
    els.statusChips.appendChild(createChip(text, tone));
    return;
  }
  state.warnings.slice(0, 3).forEach((warning) => {
    const level = warning.toLowerCase().includes('skip') ? 'warning' : 'error';
    els.statusChips.appendChild(createChip(warning, level));
  });
}

function createChip(text, tone = 'info') {
  const chip = document.createElement('span');
  chip.className = 'status-chip';
  chip.dataset.tone = tone;
  chip.textContent = text;
  return chip;
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

  if (state.metrics?.ongoing && state.metrics.ongoingEnd) {
    const item = document.createElement('li');
    item.dataset.type = 'out';
    item.dataset.ongoing = 'true';
    item.innerHTML = `<span>OUT · in progress</span><span>${formatTime(state.metrics.ongoingEnd)}</span>`;
    els.timelineList.appendChild(item);
  }
}

function copySummary() {
  if (!state.metrics) {
    pushInfo('Nothing to copy yet.');
    return;
  }
  const text = `NineToFive — ${state.metrics.dayLabel}\nWorked: ${formatDuration(state.metrics.totalWorked)}\nBreaks: ${formatDuration(state.metrics.totalBreak)}\n${state.metrics.breakBadge.label}\nStatus: ${state.metrics.ongoing ? 'Shift in progress' : 'Complete'}`;
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
  renderAll();
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

function formatTime(date) {
  return new Intl.DateTimeFormat('en-US', {
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
