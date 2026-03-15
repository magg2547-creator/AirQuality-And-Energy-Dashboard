'use strict';

const state = {
  data:         [],
  liveUrl:      CONFIG.appsScriptUrl,
  filter:       { search: '', status: '' },
  isFetching:   false,
  visibleHours: 24,
};

const DOM = (() => {
  const byId = id => document.getElementById(id);
  return {
    urlInput:          byId('appsScriptUrl'),
    fetchLiveBtn:      byId('fetchLiveBtn'),
    exportBtn:         byId('exportBtn'),
    refreshBtn:        byId('refreshBtn'),
    retryBtn:          byId('retryBtn'),
    settingsMenu:      byId('settingsMenu'),
    rangeButtons:      document.querySelectorAll('.range-btn'),
    loadingState:      byId('loadingState'),
    errorState:        byId('errorState'),
    errorMsg:          byId('errorMsg'),
    emptyState:        byId('emptyState'),
    dashContent:       byId('dashboardContent'),
    lastUpdated:       byId('lastUpdated'),
    statusDot:         document.querySelector('#statusChip .status-dot'),
    statusChipLabel:   byId('statusChipLabel'),
    heroHeading:       byId('heroHeading'),
    heroSummary:       byId('heroSummary'),
    heroRecordCount:   byId('heroRecordCount'),
    heroRisk:          byId('heroRisk'),
    heroEnergy:        byId('heroEnergy'),
    priorityCards:     byId('priorityCards'),
    overviewCards:     byId('overviewCards'),
    alertSection:      byId('alertSection'),
    alertSectionCount: byId('alertSectionCount'),
    alertList:         byId('alertList'),
    loadMetric:        byId('loadMetric'),
    energyMetric:      byId('energyMetric'),
    tableSearch:       byId('tableSearch'),
    statusFilter:      byId('statusFilter'),
    recordCards:       byId('recordCards'),
    tableBody:         byId('tableBody'),
    tableEmpty:        byId('tableEmpty'),
    recordCount:       byId('recordCount'),
  };
})();

const PRIORITY_CARD_DEFS = CARD_DEFS.filter(def => def.priority);
const SUPPORTING_CARD_DEFS = CARD_DEFS.filter(def => !def.priority);
const METRIC_DEF_MAP = new Map(CARD_DEFS.map(def => [def.key, def]));
const SEVERITY_WEIGHT = Object.freeze({ stable: 0, warning: 1, critical: 2 });

let resizeTimer = 0;

DOM.fetchLiveBtn.addEventListener('click', () => {
  const url = DOM.urlInput.value.trim();
  if (!url) {
    window.alert('Enter an Apps Script Web App URL first.');
    return;
  }

  state.liveUrl = url;
  DOM.settingsMenu.removeAttribute('open');
  loadData();
});

DOM.refreshBtn.addEventListener('click', loadData);
DOM.retryBtn.addEventListener('click', loadData);

DOM.rangeButtons.forEach(button => {
  button.addEventListener('click', () => {
    state.visibleHours = Number(button.dataset.range || 24);
    DOM.rangeButtons.forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderDashboard(state.data);
  });
});

DOM.exportBtn.addEventListener('click', () => {
  const visible = getVisibleData(state.data);
  if (!visible.length) return;
  exportCsv(visible);
  DOM.settingsMenu.removeAttribute('open');
});

DOM.tableSearch.addEventListener('input', event => {
  state.filter.search = event.target.value;
  renderTable(getVisibleData(state.data));
});

DOM.statusFilter.addEventListener('change', event => {
  state.filter.status = event.target.value;
  renderTable(getVisibleData(state.data));
});

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    initAllCharts(getVisibleData(state.data));
  }, 150);
});

async function loadData() {
  if (state.isFetching) return;

  if (!state.liveUrl) {
    setUIState('empty');
    setStatusChip('warning', 'Awaiting source');
    return;
  }

  state.isFetching = true;
  setUIState('loading');
  setStatusChip('warning', 'Fetching...');

  try {
    const response = await fetch(state.liveUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const raw = Array.isArray(json) ? json
      : Array.isArray(json.data) ? json.data
      : Array.isArray(json.records) ? json.records
      : null;

    if (!raw) {
      throw new Error('Unexpected response format. Expected an array of records.');
    }
    if (!raw.length) {
      throw new Error('The server returned an empty dataset.');
    }

    state.data = normalise(raw.slice(-CONFIG.maxLiveRecords));
    if (!state.data.length) {
      throw new Error('No valid records after normalisation.');
    }

    setUIState('ok');
    renderDashboard(state.data);
  } catch (error) {
    console.error('[AirFlow]', error);
    setUIStateError(error.message);
    setStatusChip('critical', 'Fetch failed');
  } finally {
    state.isFetching = false;
  }
}

function safeNum(value, fallback = null) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normaliseRecord(record) {
  if (!record || typeof record !== 'object') return null;

  const timestamp = String(record.timestamp || record.time || record.Time || '').trim();
  if (!timestamp) return null;

  return {
    timestamp,
    pm25:        safeNum(record.pm25, 0),
    pm10:        safeNum(record.pm10, 0),
    temperature: safeNum(record.temperature ?? record.temp, 0),
    humidity:    safeNum(record.humidity ?? record.hum, 0),
    co2:         safeNum(record.co2, 0),
    voltage:     safeNum(record.voltage, 0),
    current:     safeNum(record.current, 0),
    power:       safeNum(record.power, 0),
    energy:      safeNum(record.energy, 0),
    status: ['normal', 'warning', 'critical'].includes(String(record.status).toLowerCase())
      ? String(record.status).toLowerCase()
      : 'normal',
  };
}

function normalise(records) {
  return records.map(normaliseRecord).filter(Boolean);
}

function setUIState(next) {
  DOM.loadingState.style.display = next === 'loading' ? 'flex' : 'none';
  DOM.errorState.style.display = next === 'error' ? 'flex' : 'none';
  DOM.emptyState.style.display = next === 'empty' ? 'flex' : 'none';
  DOM.dashContent.style.display = next === 'ok' ? 'block' : 'none';
}

function setUIStateError(message) {
  setUIState('error');
  DOM.errorMsg.textContent = message;
}

function setStatusChip(level, text) {
  DOM.statusDot.className = `status-dot ${level}`;
  DOM.statusChipLabel.textContent = text;
}

function getVisibleData(data) {
  if (!Array.isArray(data) || !data.length) return [];
  const points = Math.max(1, Math.round((state.visibleHours * 60) / CONFIG.sampleIntervalMin));
  return data.slice(-points);
}

function renderDashboard(data) {
  const visible = getVisibleData(data);
  const latest = visible.length ? visible[visible.length - 1] : null;
  const alerts = buildAlertItems(latest);

  DOM.lastUpdated.textContent = latest
    ? `Last updated ${formatTime(latest.timestamp)}`
    : 'Last updated --';
  DOM.loadMetric.textContent = latest
    ? `Avg ${formatMetricValue(averageOf(visible, 'voltage'), getMetricDef('voltage'))} V | ${formatMetricValue(averageOf(visible, 'current'), getMetricDef('current'))} A`
    : 'Avg --';
  DOM.energyMetric.textContent = latest
    ? `Peak ${formatMetricValue(maxOf(visible, 'power'), getMetricDef('power'))} W | ${formatMetricValue(latest.energy, getMetricDef('energy'))} kWh`
    : 'Energy -- kWh';

  renderHero(visible, latest, alerts);
  renderPriorityCards(visible, latest);
  renderOverviewCards(visible, latest);
  renderAlerts(visible, alerts);
  renderStatusChip(latest, alerts);
  renderTable(visible);
  initAllCharts(visible);
}

function getMetricDef(key) {
  return METRIC_DEF_MAP.get(key);
}

function getMetricLevel(value, key) {
  const threshold = THRESHOLDS[key];
  if (!threshold || !Number.isFinite(value)) return 'stable';
  if (value >= threshold.crit) return 'critical';
  if (value >= threshold.warn) return 'warning';
  return 'stable';
}

function calculateDelta(data, key) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const current = data[data.length - 1][key];
  const previous = data[data.length - 2][key];
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return current - previous;
}

function formatMetricValue(value, def) {
  if (!Number.isFinite(value)) return '--';
  const decimals = typeof def?.decimals === 'number'
    ? def.decimals
    : Number.isInteger(value) ? 0 : 1;

  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDelta(delta, def) {
  if (!Number.isFinite(delta)) return 'Steady';
  const decimals = typeof def?.decimals === 'number' ? def.decimals : 1;
  const absolute = Math.abs(delta).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (delta === 0) return 'Steady';
  return `${delta > 0 ? '+' : '-'}${absolute}`;
}

function formatStatusLabel(level) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function getDeltaClass(delta) {
  if (!Number.isFinite(delta) || delta === 0) return '';
  return delta > 0 ? 'delta-up' : 'delta-dn';
}

function renderHero(data, latest, alerts) {
  const dominantAlert = alerts[0] || null;
  const energyDef = getMetricDef('energy');
  const heroCopy = getHeroCopy(latest, alerts, dominantAlert);

  DOM.heroHeading.textContent = heroCopy.heading;
  DOM.heroSummary.textContent = heroCopy.summary;
  DOM.heroRecordCount.textContent = data.length ? `${data.length} samples` : '--';
  DOM.heroRisk.textContent = dominantAlert
    ? `${dominantAlert.label} ${formatMetricValue(dominantAlert.value, getMetricDef(dominantAlert.key))} ${dominantAlert.unit}`
    : 'No active alerts';
  DOM.heroEnergy.textContent = latest
    ? `${formatMetricValue(latest.energy, energyDef)} ${energyDef.unit}`
    : '--';
}

function getHeroCopy(latest, alerts, dominantAlert) {
  if (!latest) {
    return {
      heading: 'Waiting for live data',
      summary: 'Connect a data source to see the latest indoor conditions, alert pressure, and load trends.',
    };
  }

  const criticalCount = alerts.filter(item => item.level === 'critical').length;
  const warningCount = alerts.filter(item => item.level === 'warning').length;

  if (criticalCount) {
    return {
      heading: 'Critical conditions need attention',
      summary: `${criticalCount} critical threshold breach${criticalCount === 1 ? '' : 'es'} detected. ${dominantAlert.label} is the main pressure point right now.`,
    };
  }

  if (warningCount) {
    return {
      heading: 'Conditions are above normal',
      summary: `${warningCount} metric${warningCount === 1 ? '' : 's'} are above warning level. Watch ${dominantAlert.label} and confirm the short-term trend below.`,
    };
  }

  return {
    heading: 'Environment is stable',
    summary: `No active threshold breaches across the selected ${state.visibleHours}h range. Use the charts below to confirm the trend.`,
  };
}

function renderPriorityCards(data, latest) {
  DOM.priorityCards.innerHTML = PRIORITY_CARD_DEFS.map(def => buildPriorityCardMarkup(def, data, latest)).join('');
}

function buildPriorityCardMarkup(def, data, latest) {
  const value = latest ? latest[def.key] : null;
  const level = getMetricLevel(value, def.key);
  const delta = calculateDelta(data, def.key);
  const formattedValue = formatMetricValue(value, def);
  const formattedDelta = formatDelta(delta, def);

  return `<article class="priority-card priority-card--${level}">
    <div class="priority-card-top">
      <span class="priority-card-label">${escapeHtml(def.label)}</span>
      <span class="priority-card-state priority-card-state--${level}">${escapeHtml(formatStatusLabel(level))}</span>
    </div>
    <div class="priority-card-value">
      ${escapeHtml(formattedValue)}
      <span class="priority-card-unit">${escapeHtml(def.unit)}</span>
    </div>
    <div class="priority-card-foot">
      <span class="priority-card-note">${escapeHtml(def.note)}</span>
      <span class="priority-card-delta ${getDeltaClass(delta)}">${escapeHtml(formattedDelta)}</span>
    </div>
  </article>`;
}

function renderOverviewCards(data, latest) {
  DOM.overviewCards.innerHTML = SUPPORTING_CARD_DEFS.map(def => {
    const value = latest ? latest[def.key] : null;
    const level = getMetricLevel(value, def.key);
    const delta = calculateDelta(data, def.key);

    return `<article class="kpi-card kpi-${level}">
      <div class="kpi-top">
        <span class="kpi-icon" aria-hidden="true">${escapeHtml(def.tag)}</span>
        <span class="kpi-label">${escapeHtml(def.label)}</span>
      </div>
      <div class="kpi-value">${escapeHtml(formatMetricValue(value, def))}<span class="kpi-unit"> ${escapeHtml(def.unit)}</span></div>
      <div class="kpi-foot">
        <span class="kpi-delta ${getDeltaClass(delta)}">${escapeHtml(formatDelta(delta, def))}</span>
        <span class="kpi-level kpi-level-${level}">${escapeHtml(formatStatusLabel(level))}</span>
      </div>
    </article>`;
  }).join('');
}

function buildAlertItems(latest) {
  if (!latest) return [];

  const items = [];
  for (const check of ALERT_CHECKS) {
    const threshold = THRESHOLDS[check.key];
    const value = latest[check.key];
    if (!threshold || !Number.isFinite(value)) continue;

    if (value >= threshold.crit) {
      items.push({
        key: check.key,
        level: 'critical',
        label: check.label,
        value,
        unit: check.unit,
        description: `Critical limit ${threshold.crit} ${check.unit}`,
      });
      continue;
    }

    if (value >= threshold.warn) {
      items.push({
        key: check.key,
        level: 'warning',
        label: check.label,
        value,
        unit: check.unit,
        description: `Warning threshold ${threshold.warn} ${check.unit}`,
      });
    }
  }

  items.sort((left, right) => {
    const severityGap = SEVERITY_WEIGHT[right.level] - SEVERITY_WEIGHT[left.level];
    if (severityGap !== 0) return severityGap;
    return right.value - left.value;
  });

  return items;
}

function renderAlerts(data, alerts) {
  if (!alerts.length) {
    DOM.alertSection.style.display = 'none';
    DOM.alertList.innerHTML = '';
    return;
  }

  const activeRecords = data.filter(record => record.status !== 'normal').length;
  DOM.alertSection.style.display = 'block';
  DOM.alertSectionCount.textContent = `${alerts.length} active | ${activeRecords} record${activeRecords === 1 ? '' : 's'} flagged`;
  DOM.alertList.innerHTML = alerts.map(item => `
    <div class="alert-row alert-row-${item.level}">
      <div class="alert-row-main">
        <span class="alert-row-name">${escapeHtml(item.label)}</span>
        <span class="alert-row-desc">${escapeHtml(item.description)}</span>
      </div>
      <div class="alert-row-metrics">
        <strong class="alert-row-value">${escapeHtml(formatMetricValue(item.value, getMetricDef(item.key)))} ${escapeHtml(item.unit)}</strong>
        <span class="alert-row-badge alert-badge-${item.level}">${escapeHtml(item.level)}</span>
      </div>
    </div>
  `).join('');
}

function renderStatusChip(latest, alerts) {
  if (!latest) {
    setStatusChip('warning', 'Awaiting source');
    return;
  }

  if (alerts.some(item => item.level === 'critical') || latest.status === 'critical') {
    setStatusChip('critical', 'Critical now');
    return;
  }

  if (alerts.length || latest.status === 'warning') {
    setStatusChip('warning', 'Watch conditions');
    return;
  }

  setStatusChip('online', 'Stable now');
}

function applyFilters(data) {
  const search = state.filter.search.toLowerCase();
  const status = state.filter.status;

  return data.filter(record => {
    if (status && record.status !== status) return false;
    if (!search) return true;

    return [
      record.timestamp,
      String(record.pm25),
      String(record.pm10),
      String(record.co2),
      String(record.power),
      record.status,
    ].some(value => value.toLowerCase().includes(search));
  });
}

function renderTable(data) {
  const filtered = applyFilters(data).slice().reverse();
  DOM.recordCount.textContent = `${filtered.length} record${filtered.length === 1 ? '' : 's'}`;

  if (!filtered.length) {
    DOM.recordCards.innerHTML = '';
    DOM.tableBody.innerHTML = '';
    DOM.tableEmpty.style.display = 'block';
    return;
  }

  DOM.tableEmpty.style.display = 'none';
  DOM.recordCards.innerHTML = filtered.map(buildRecordCardMarkup).join('');
  DOM.tableBody.innerHTML = filtered.map(buildTableRowMarkup).join('');
}

function buildRecordCardMarkup(record) {
  return `<article class="record-card">
    <div class="record-card-head">
      <div class="record-card-time-wrap">
        <strong class="record-card-time">${escapeHtml(formatTime(record.timestamp))}</strong>
        <span class="record-card-subtitle">PM2.5 ${escapeHtml(formatMetricValue(record.pm25, getMetricDef('pm25')))} ug/m3 | CO2 ${escapeHtml(formatMetricValue(record.co2, getMetricDef('co2')))} ppm</span>
      </div>
      <span class="status-badge status-${escapeHtml(record.status)}">${escapeHtml(record.status)}</span>
    </div>
    <dl class="record-card-grid">
      ${buildRecordCell('PM10', record.pm10, 'pm10')}
      ${buildRecordCell('Temp', record.temperature, 'temperature')}
      ${buildRecordCell('Humidity', record.humidity, 'humidity')}
      ${buildRecordCell('Voltage', record.voltage, 'voltage')}
      ${buildRecordCell('Current', record.current, 'current')}
      ${buildRecordCell('Power', record.power, 'power')}
      ${buildRecordCell('Energy', record.energy, 'energy')}
    </dl>
  </article>`;
}

function buildRecordCell(label, value, key) {
  const def = getMetricDef(key);
  return `<div class="record-card-cell">
    <dt>${escapeHtml(label)}</dt>
    <dd>${escapeHtml(formatMetricValue(value, def))} ${escapeHtml(def.unit)}</dd>
  </div>`;
}

function buildTableRowMarkup(record) {
  return `<tr>
    <td>${escapeHtml(formatTime(record.timestamp))}</td>
    <td>${escapeHtml(formatMetricValue(record.pm25, getMetricDef('pm25')))}</td>
    <td>${escapeHtml(formatMetricValue(record.pm10, getMetricDef('pm10')))}</td>
    <td>${escapeHtml(formatMetricValue(record.temperature, getMetricDef('temperature')))}</td>
    <td>${escapeHtml(formatMetricValue(record.humidity, getMetricDef('humidity')))}</td>
    <td>${escapeHtml(formatMetricValue(record.co2, getMetricDef('co2')))}</td>
    <td>${escapeHtml(formatMetricValue(record.voltage, getMetricDef('voltage')))}</td>
    <td>${escapeHtml(formatMetricValue(record.current, getMetricDef('current')))}</td>
    <td>${escapeHtml(formatMetricValue(record.power, getMetricDef('power')))}</td>
    <td>${escapeHtml(formatMetricValue(record.energy, getMetricDef('energy')))}</td>
    <td><span class="status-badge status-${escapeHtml(record.status)}">${escapeHtml(record.status)}</span></td>
  </tr>`;
}

function averageOf(data, key) {
  if (!Array.isArray(data) || !data.length) return null;
  const values = data.map(item => item[key]).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxOf(data, key) {
  if (!Array.isArray(data) || !data.length) return null;
  const values = data.map(item => item[key]).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.max(...values);
}

function formatTime(value) {
  if (!value) return '--';
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function exportCsv(data) {
  const headers = ['timestamp', 'pm25', 'pm10', 'temperature', 'humidity', 'co2', 'voltage', 'current', 'power', 'energy', 'status'];
  const rows = data.map(record => headers.map(header => csvEscape(record[header])));
  const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `airflow-export-${state.visibleHours}h.csv`,
  });

  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const stringValue = String(value ?? '');
  return (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n'))
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  if (CONFIG.appsScriptUrl && CONFIG.useLiveByDefault) {
    DOM.urlInput.value = CONFIG.appsScriptUrl;
    state.liveUrl = CONFIG.appsScriptUrl;
    loadData();
    return;
  }

  setUIState('empty');
  setStatusChip('warning', 'Awaiting source');
});
