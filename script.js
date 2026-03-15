'use strict';

const state = {
  data:         [],
  liveUrl:      CONFIG.appsScriptUrl,
  filter:       { search: '', status: '' },
  isFetching:   false,
  isPreview:    false,
  chartCompact: window.matchMedia('(max-width: 720px)').matches,
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
    sourceBanner:      byId('sourceBanner'),
    sourceBannerKicker: byId('sourceBannerKicker'),
    sourceBannerTitle: byId('sourceBannerTitle'),
    sourceBannerText:  byId('sourceBannerText'),
    connectSourceBtn:  byId('connectSourceBtn'),
    heroHeading:       byId('heroHeading'),
    heroSummary:       byId('heroSummary'),
    heroRecordCount:   byId('heroRecordCount'),
    heroRisk:          byId('heroRisk'),
    heroEnergy:        byId('heroEnergy'),
    pmMetric:          byId('pmMetric'),
    co2Metric:         byId('co2Metric'),
    comfortMetric:     byId('comfortMetric'),
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
let chartRenderFrame = 0;

DOM.urlInput.addEventListener('input', () => {
  DOM.urlInput.setCustomValidity('');
});

DOM.fetchLiveBtn.addEventListener('click', () => {
  const url = DOM.urlInput.value.trim();
  if (!url) {
    DOM.urlInput.setCustomValidity('Paste your Apps Script Web App URL first.');
    DOM.urlInput.reportValidity();
    DOM.urlInput.focus();
    return;
  }

  DOM.urlInput.setCustomValidity('');
  DOM.urlInput.value = url;
  if (!DOM.urlInput.checkValidity()) {
    DOM.urlInput.reportValidity();
    DOM.urlInput.focus();
    return;
  }

  state.liveUrl = url;
  DOM.settingsMenu.removeAttribute('open');
  loadData();
});

DOM.refreshBtn.addEventListener('click', loadData);
DOM.retryBtn.addEventListener('click', loadData);
DOM.connectSourceBtn.addEventListener('click', openSettingsMenu);

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
    const compact = window.matchMedia('(max-width: 720px)').matches;
    if (compact !== state.chartCompact) {
      state.chartCompact = compact;
      scheduleChartRender(getVisibleData(state.data));
    }
  }, 120);
});

async function loadData() {
  if (state.isFetching) return;

  if (!state.liveUrl) {
    loadPreviewData();
    return;
  }

  state.isPreview = false;
  state.isFetching = true;
  setBusyState(true);

  const hasExistingData = Array.isArray(state.data) && state.data.length > 0;
  if (!hasExistingData) {
    setUIState('loading');
  } else {
    setUIState('ok');
  }
  setStatusChip('warning', hasExistingData ? 'Refreshing...' : 'Fetching...');

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

    state.isPreview = false;
    setUIState('ok');
    renderDashboard(state.data);
  } catch (error) {
    if (hasExistingData) {
      setUIState('ok');
      DOM.lastUpdated.textContent = 'Update failed | showing previous data';
      setStatusChip('critical', 'Refresh failed');
      return;
    }

    setUIStateError(error.message);
    setStatusChip('critical', 'Fetch failed');
  } finally {
    state.isFetching = false;
    setBusyState(false);
  }
}

function loadPreviewData() {
  state.isPreview = true;
  state.data = generatePreviewData();
  state.isFetching = false;
  setBusyState(false);
  setUIState('ok');
  renderDashboard(state.data);
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
  DOM.dashContent.style.display = next === 'ok' ? 'grid' : 'none';
}

function setUIStateError(message) {
  setUIState('error');
  DOM.errorMsg.textContent = message;
}

function setBusyState(isBusy) {
  DOM.fetchLiveBtn.disabled = isBusy;
  DOM.refreshBtn.disabled = isBusy;
  DOM.retryBtn.disabled = isBusy;
  DOM.refreshBtn.classList.toggle('is-loading', isBusy);
  DOM.dashContent.setAttribute('aria-busy', String(isBusy));
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
  const voltageDef = getMetricDef('voltage');
  const currentDef = getMetricDef('current');
  const energyDef = getMetricDef('energy');
  const temperatureDef = getMetricDef('temperature');
  const humidityDef = getMetricDef('humidity');

  DOM.lastUpdated.textContent = latest
    ? `Last updated ${formatShortTime(latest.timestamp)}`
    : 'Last updated --';
  DOM.pmMetric.textContent = latest
    ? `${formatMetricValue(latest.pm25, getMetricDef('pm25'))} / ${formatMetricValue(latest.pm10, getMetricDef('pm10'))} ug/m3`
    : 'Latest --';
  DOM.co2Metric.textContent = latest
    ? `${formatMetricValue(latest.co2, getMetricDef('co2'))} ppm`
    : 'Latest --';
  DOM.comfortMetric.textContent = latest
    ? `${formatMetricValue(latest.temperature, temperatureDef)} C | ${formatMetricValue(latest.humidity, humidityDef)}%`
    : 'Latest --';
  DOM.loadMetric.textContent = latest
    ? `Avg ${formatMetricValue(averageOf(visible, 'voltage'), voltageDef)} V | ${formatMetricValue(averageOf(visible, 'current'), currentDef)} A`
    : 'Avg --';
  DOM.energyMetric.textContent = latest
    ? `Peak ${formatMetricValue(maxOf(visible, 'power'), getMetricDef('power'))} W | ${formatMetricValue(latest.energy, energyDef)} kWh`
    : 'Energy -- kWh';

  renderSourceBanner();
  renderHero(visible, latest, alerts);
  renderPriorityCards(visible, latest);
  renderOverviewCards(visible, latest);
  renderAlerts(visible, alerts);
  renderStatusChip(latest, alerts);
  renderTable(visible);
  scheduleChartRender(visible);
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
  if (state.isPreview) {
    return {
      heading: 'Interactive preview is active',
      summary: 'Sample readings are populating the dashboard so layout, spacing, and responsive behavior can be refined before the live Apps Script source is attached.',
    };
  }

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

function renderSourceBanner() {
  if (state.isPreview) {
    DOM.sourceBanner.style.display = 'flex';
    DOM.sourceBannerKicker.textContent = 'Preview mode';
    DOM.sourceBannerTitle.textContent = 'Sample data is active until the live feed is connected';
    DOM.sourceBannerText.textContent = 'Open Settings and paste your Apps Script URL whenever you want to switch this page to live sensor data.';
    return;
  }

  DOM.sourceBanner.style.display = 'none';
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
  DOM.alertSection.style.display = 'grid';
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
  if (state.isPreview) {
    setStatusChip('preview', 'Preview feed');
    return;
  }

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
      <span class="status-badge status-${escapeHtml(record.status)}">${escapeHtml(getRecordStatusLabel(record.status))}</span>
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
    <td><span class="status-badge status-${escapeHtml(record.status)}">${escapeHtml(getRecordStatusLabel(record.status))}</span></td>
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
    hour12: false,
  });
}

function formatShortTime(value) {
  if (!value) return '--';
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getRecordStatusLabel(status) {
  return status === 'normal' ? 'Stable' : formatStatusLabel(status);
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

function openSettingsMenu() {
  DOM.settingsMenu.setAttribute('open', '');
  window.requestAnimationFrame(() => {
    DOM.urlInput.focus();
  });
}

function scheduleChartRender(records) {
  if (!Array.isArray(records) || !records.length) return;
  window.cancelAnimationFrame(chartRenderFrame);
  chartRenderFrame = window.requestAnimationFrame(() => {
    initAllCharts(records);
  });
}

function generatePreviewData() {
  const points = Math.max(24, Math.round((24 * 60) / CONFIG.sampleIntervalMin));
  const now = new Date();
  const preview = [];
  let energy = 8.4;

  for (let index = 0; index < points; index += 1) {
    const offset = (points - 1 - index) * CONFIG.sampleIntervalMin;
    const stamp = new Date(now.getTime() - offset * 60 * 1000);
    const waveA = Math.sin(index / 5.2);
    const waveB = Math.cos(index / 7.8);
    const lateLift = index > points - 12 ? (index - (points - 12)) * 1.8 : 0;

    const pm25 = clampNumber(18 + waveA * 7 + Math.max(0, waveB) * 8 + lateLift, 12, 68);
    const pm10 = clampNumber(pm25 * 1.34 + 6 + Math.max(0, Math.sin(index / 4.8) * 5), 22, 92);
    const co2 = clampNumber(610 + (waveA + 1.1) * 72 + Math.max(0, Math.sin((index - 22) / 8) * 118), 520, 980);
    const temperature = clampNumber(27.1 + Math.sin(index / 8.6) * 1.1 + Math.cos(index / 11.3) * 0.5, 25.4, 31.8);
    const humidity = clampNumber(60 + Math.cos(index / 6.1) * 5 + Math.sin(index / 10.4) * 4, 49, 74);
    const voltage = clampNumber(227.5 + Math.sin(index / 9.4) * 2 + (index > points - 8 ? 2.4 : 0), 224, 235);
    const current = clampNumber(0.41 + Math.max(0, Math.sin(index / 5.1)) * 0.26 + lateLift * 0.006, 0.28, 0.92);
    const power = clampNumber(voltage * current * 0.71, 62, 146);

    energy += (power * (CONFIG.sampleIntervalMin / 60)) / 1000;

    const record = {
      timestamp: formatTimestamp(stamp),
      pm25: roundValue(pm25, 0),
      pm10: roundValue(pm10, 0),
      temperature: roundValue(temperature, 1),
      humidity: roundValue(humidity, 0),
      co2: roundValue(co2, 0),
      voltage: roundValue(voltage, 0),
      current: roundValue(current, 2),
      power: roundValue(power, 0),
      energy: roundValue(energy, 1),
    };

    record.status = derivePreviewStatus(record);
    preview.push(record);
  }

  return preview;
}

function derivePreviewStatus(record) {
  const checks = ['pm25', 'pm10', 'co2', 'temperature', 'humidity', 'voltage', 'power'];
  let worst = 'normal';

  for (const key of checks) {
    const level = getMetricLevel(record[key], key);
    if (level === 'critical') return 'critical';
    if (level === 'warning') worst = 'warning';
  }

  return worst;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundValue(value, decimals) {
  return Number(value.toFixed(decimals));
}

function formatTimestamp(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

document.addEventListener('DOMContentLoaded', () => {
  if (CONFIG.appsScriptUrl && CONFIG.useLiveByDefault) {
    DOM.urlInput.value = CONFIG.appsScriptUrl;
    state.liveUrl = CONFIG.appsScriptUrl;
    loadData();
    return;
  }

  loadPreviewData();
});
