'use strict';

// ── App state ──────────────────────────────────────────────────
const state = {
  data:         [],
  liveUrl:      CONFIG.appsScriptUrl,
  filter:       { search: '', status: '' },
  isFetching:   false,
  visibleHours: 24,
};

// ── Cached DOM references ──────────────────────────────────────
const DOM = (() => {
  const $ = id => document.getElementById(id);
  return {
    urlInput:          $('appsScriptUrl'),
    fetchLiveBtn:      $('fetchLiveBtn'),
    exportBtn:         $('exportBtn'),
    refreshBtn:        $('refreshBtn'),
    retryBtn:          $('retryBtn'),
    settingsMenu:      $('settingsMenu'),
    rangeButtons:      document.querySelectorAll('.range-btn'),
    loadingState:      $('loadingState'),
    errorState:        $('errorState'),
    errorMsg:          $('errorMsg'),
    emptyState:        $('emptyState'),
    dashContent:       $('dashboardContent'),
    lastUpdated:       $('lastUpdated'),
    statusDot:         document.querySelector('#statusChip .status-dot'),
    statusChipLabel:   $('statusChipLabel'),
    overviewCards:     $('overviewCards'),
    alertSection:      $('alertSection'),
    alertSectionCount: $('alertSectionCount'),
    alertList:         $('alertList'),
    energyMetric:      $('energyMetric'),
    tableSearch:       $('tableSearch'),
    statusFilter:      $('statusFilter'),
    tableBody:         $('tableBody'),
    tableEmpty:        $('tableEmpty'),
    recordCount:       $('recordCount'),
  };
})();

// ── Event wiring ───────────────────────────────────────────────
DOM.fetchLiveBtn.addEventListener('click', () => {
  const url = DOM.urlInput.value.trim();
  if (!url) { window.alert('Enter an Apps Script Web App URL first.'); return; }
  state.liveUrl = url;
  loadData();
});

DOM.refreshBtn.addEventListener('click', loadData);
DOM.retryBtn.addEventListener('click', loadData);

DOM.rangeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    state.visibleHours = Number(btn.dataset.range || 24);
    DOM.rangeButtons.forEach(b => b.classList.toggle('active', b === btn));
    renderDashboard(state.data);
  });
});

DOM.exportBtn.addEventListener('click', () => {
  const visible = getVisibleData(state.data);
  if (!visible.length) return;
  exportCsv(visible);
  DOM.settingsMenu.removeAttribute('open');
});

DOM.tableSearch.addEventListener('input', e => {
  state.filter.search = e.target.value;
  renderTable(getVisibleData(state.data));
});

DOM.statusFilter.addEventListener('change', e => {
  state.filter.status = e.target.value;
  renderTable(getVisibleData(state.data));
});

// ── Data loading ───────────────────────────────────────────────
async function loadData() {
  if (state.isFetching) return;

  if (!state.liveUrl) {
    setUIState('empty');
    return;
  }

  state.isFetching = true;
  setUIState('loading');
  setStatusChip('warning', 'Fetching...');

  try {
    const res = await fetch(state.liveUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const json = await res.json();
    const raw  = Array.isArray(json)         ? json
               : Array.isArray(json.data)    ? json.data
               : Array.isArray(json.records) ? json.records
               : null;

    if (!raw)        throw new Error('Unexpected response format. Expected an array of records.');
    if (!raw.length) throw new Error('The server returned an empty dataset.');

    state.data = normalise(raw.slice(-CONFIG.maxLiveRecords));
    if (!state.data.length) throw new Error('No valid records after normalisation.');

    setUIState('ok');
  } catch (err) {
    console.error('[AirFlow]', err);
    setUIStateError(err.message);
    setStatusChip('critical', 'Fetch failed');
    state.isFetching = false;
    return;
  }

  state.isFetching = false;
  renderDashboard(state.data);
}

// ── Normalisation ──────────────────────────────────────────────
function safeNum(v, fallback = null) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function normaliseRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const timestamp = String(r.timestamp || r.time || r.Time || '').trim();
  if (!timestamp) return null;
  return {
    timestamp,
    pm25:        safeNum(r.pm25,                  0),
    pm10:        safeNum(r.pm10,                  0),
    temperature: safeNum(r.temperature ?? r.temp, 0),
    humidity:    safeNum(r.humidity    ?? r.hum,  0),
    co2:         safeNum(r.co2,                   0),
    voltage:     safeNum(r.voltage,               0),
    current:     safeNum(r.current,               0),
    power:       safeNum(r.power,                 0),
    energy:      safeNum(r.energy,                0),
    status: ['normal', 'warning', 'critical'].includes(String(r.status).toLowerCase())
      ? String(r.status).toLowerCase() : 'normal',
  };
}

function normalise(records) {
  return records.map(normaliseRecord).filter(Boolean);
}

// ── UI state ───────────────────────────────────────────────────
function setUIState(next) {
  DOM.loadingState.style.display = next === 'loading' ? 'flex'  : 'none';
  DOM.errorState.style.display   = next === 'error'   ? 'flex'  : 'none';
  DOM.emptyState.style.display   = next === 'empty'   ? 'flex'  : 'none';
  DOM.dashContent.style.display  = next === 'ok'      ? 'block' : 'none';
}

function setUIStateError(msg) {
  setUIState('error');
  DOM.errorMsg.textContent = msg;
}

function setStatusChip(level, text) {
  DOM.statusDot.className         = `status-dot ${level}`;
  DOM.statusChipLabel.textContent = text;
}

// ── Slice to visible window ────────────────────────────────────
function getVisibleData(data) {
  if (!Array.isArray(data) || !data.length) return [];
  const pts = Math.max(1, Math.round(
    (state.visibleHours * 60) / CONFIG.sampleIntervalMin
  ));
  return data.slice(-pts);
}

// ── Render orchestrator ────────────────────────────────────────
function renderDashboard(data) {
  const visible = getVisibleData(data);
  const latest  = visible.length ? visible[visible.length - 1] : null;

  DOM.lastUpdated.textContent  = latest
    ? `Last updated ${formatTime(latest.timestamp)}`
    : 'Last updated --';
  DOM.energyMetric.textContent = latest
    ? `Energy ${latest.energy} kWh`
    : 'Energy -- kWh';

  renderOverviewCards(visible, latest);
  renderAlerts(visible, latest);
  renderStatusChip(latest);
  renderTable(visible);
  initAllCharts(visible);
}

// ── Overview cards ─────────────────────────────────────────────
function getMetricLevel(value, key) {
  const t = THRESHOLDS[key];
  if (!t || !Number.isFinite(value)) return 'stable';
  if (value >= t.crit) return 'critical';
  if (value >= t.warn) return 'warning';
  return 'stable';
}

function calculateDelta(data, key) {
  if (data.length < 2) return null;
  const a = data[data.length - 1][key];
  const b = data[data.length - 2][key];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return +(a - b).toFixed(2);
}

function renderOverviewCards(data, latest) {
  DOM.overviewCards.innerHTML = CARD_DEFS.map(def => {
    const value      = latest !== null ? latest[def.key] : '--';
    const level      = getMetricLevel(value, def.key);
    const delta      = calculateDelta(data, def.key);
    const deltaStr   = delta === null ? '' : `${delta >= 0 ? '+' : ''}${delta}`;
    const deltaClass = delta === null ? '' : delta > 0 ? 'delta-up' : delta < 0 ? 'delta-dn' : '';
    const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

    return `<article class="kpi-card kpi-${level}">
  <div class="kpi-top">
    <span class="kpi-icon" aria-hidden="true">${def.icon}</span>
    <span class="kpi-label">${def.label}</span>
  </div>
  <div class="kpi-value">${value}<span class="kpi-unit"> ${def.unit}</span></div>
  <div class="kpi-foot">
    <span class="kpi-level kpi-level-${level}">${levelLabel}</span>${deltaStr
      ? `<span class="kpi-delta ${deltaClass}">${deltaStr}</span>` : ''}
  </div>
</article>`;
  }).join('');
}

// ── Alerts ─────────────────────────────────────────────────────
function buildAlertItems(latest) {
  if (!latest) return [];
  const items = [];
  for (const chk of ALERT_CHECKS) {
    const t = THRESHOLDS[chk.key];
    const v = latest[chk.key];
    if (!t || !Number.isFinite(v)) continue;
    if (v >= t.crit) {
      items.push({ level: 'critical', label: chk.label, value: v, unit: chk.unit,
        desc: `Exceeds critical limit of ${t.crit} ${chk.unit}` });
    } else if (v >= t.warn) {
      items.push({ level: 'warning',  label: chk.label, value: v, unit: chk.unit,
        desc: `Above warning threshold of ${t.warn} ${chk.unit}` });
    }
  }
  return items;
}

function renderAlerts(data, latest) {
  const items   = buildAlertItems(latest);
  const nActive = data.filter(r => r.status !== 'normal').length;

  if (!items.length) { DOM.alertSection.style.display = 'none'; return; }

  DOM.alertSection.style.display    = 'block';
  DOM.alertSectionCount.textContent =
    `${items.length} active · ${nActive} record${nActive === 1 ? '' : 's'} in range`;

  DOM.alertList.innerHTML = items.map(item => `
<div class="alert-row alert-row-${item.level}">
  <div class="alert-row-indicator"></div>
  <div class="alert-row-body">
    <span class="alert-row-name">${item.label}</span>
    <span class="alert-row-value">${item.value} ${item.unit}</span>
    <span class="alert-row-desc">${item.desc}</span>
  </div>
  <span class="alert-row-badge alert-badge-${item.level}">${item.level}</span>
</div>`).join('');
}

// ── Status chip ────────────────────────────────────────────────
function renderStatusChip(latest) {
  if (!latest || latest.status === 'normal') setStatusChip('online',   'Live stable');
  else if (latest.status === 'critical')     setStatusChip('critical', 'Live critical');
  else                                       setStatusChip('warning',  'Live warning');
}

// ── Table ──────────────────────────────────────────────────────
function applyFilters(data) {
  const q = state.filter.search.toLowerCase();
  const s = state.filter.status;
  return data.filter(r => {
    if (s && r.status !== s) return false;
    if (!q) return true;
    return [r.timestamp, String(r.pm25), String(r.pm10), String(r.co2), r.status]
      .some(v => v.toLowerCase().includes(q));
  });
}

function renderTable(data) {
  const filtered = applyFilters(data).slice().reverse();
  DOM.recordCount.textContent = `${filtered.length} record${filtered.length === 1 ? '' : 's'}`;

  if (!filtered.length) {
    DOM.tableBody.innerHTML      = '';
    DOM.tableEmpty.style.display = 'block';
    return;
  }
  DOM.tableEmpty.style.display = 'none';
  DOM.tableBody.innerHTML = filtered.map(r => `<tr>
  <td>${formatTime(r.timestamp)}</td>
  <td>${r.pm25}</td><td>${r.pm10}</td>
  <td>${r.temperature}</td><td>${r.humidity}</td>
  <td>${r.co2}</td><td>${r.voltage}</td>
  <td>${r.current}</td><td>${r.power}</td><td>${r.energy}</td>
  <td><span class="status-badge status-${r.status}">${r.status}</span></td>
</tr>`).join('');
}

// ── Helpers ────────────────────────────────────────────────────
function formatTime(value) {
  if (!value) return '--';
  const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function exportCsv(data) {
  const headers = ['timestamp','pm25','pm10','temperature','humidity',
                   'co2','voltage','current','power','energy','status'];
  const rows = data.map(r => headers.map(h => csvEscape(r[h])));
  const csv  = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: `airflow-export-${state.visibleHours}h.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = String(value ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (CONFIG.appsScriptUrl) {
    DOM.urlInput.value = CONFIG.appsScriptUrl;
    state.liveUrl = CONFIG.appsScriptUrl;
    loadData();
  } else {
    setUIState('empty');
  }
});
