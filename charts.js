'use strict';

// ── Chart.js globals ───────────────────────────────────────────
Chart.defaults.color       = '#607083';
Chart.defaults.borderColor = 'rgba(230,235,242,0.9)';
Chart.defaults.font.family = "'DM Sans', sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.animation   = false;

// ── Shared style constants ─────────────────────────────────────
const GRID  = { color: 'rgba(230,235,242,0.9)', drawTicks: false };
const TICKS = { color: '#607083', maxTicksLimit: 6, padding: 8 };
const AXIS  = {
  border: { display: false },
  grid:   GRID,
  ticks:  { ...TICKS, maxRotation: 0 },
};

const TOOLTIP_BASE = {
  backgroundColor: '#16202c',
  borderWidth:     0,
  padding:         10,
  titleColor:      '#ffffff',
  bodyColor:       '#f1f5f9',
  displayColors:   true,
  cornerRadius:    10,
  titleFont: { family: "'DM Sans', sans-serif", size: 12, weight: '700' },
  bodyFont:  { family: "'DM Sans', sans-serif", size: 12 },
};

// ── Instance registry ──────────────────────────────────────────
const CHARTS = {};

// ── Helpers ────────────────────────────────────────────────────
function lineDataset(label, values, color, extra = {}) {
  return {
    label,
    data:             values,
    borderColor:      color,
    backgroundColor:  color,
    borderWidth:      2,
    fill:             false,
    tension:          0.35,
    pointRadius:      0,
    pointHoverRadius: 4,
    ...extra,
  };
}

function timeLabels(records) {
  return records.map(r => {
    const d = new Date(String(r.timestamp || '').replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(r.timestamp || '');
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  });
}

function baseOptions(yUnit = '') {
  return {
    responsive:          true,
    maintainAspectRatio: false,
    interaction:         { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display:  true,
        position: 'top',
        align:    'start',
        labels:   { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 },
      },
      tooltip: {
        ...TOOLTIP_BASE,
        callbacks: {
          label: ctx =>
            `${ctx.dataset.label}: ${ctx.parsed.y}${yUnit ? ` ${yUnit}` : ''}`,
        },
      },
    },
    scales: {
      x: AXIS,
      y: { ...AXIS, ticks: TICKS },
    },
  };
}

function buildChart(canvasId, config) {
  if (CHARTS[canvasId]) {
    CHARTS[canvasId].destroy();
    delete CHARTS[canvasId];
  }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  CHARTS[canvasId] = new Chart(canvas.getContext('2d'), config);
  return CHARTS[canvasId];
}

// ── Chart builders ─────────────────────────────────────────────
function buildChartPM(records) {
  buildChart('chartPM', {
    type: 'line',
    data: {
      labels:   timeLabels(records),
      datasets: [
        lineDataset('PM2.5', records.map(r => r.pm25), '#2563eb'),
        lineDataset('PM10',  records.map(r => r.pm10), '#94a3b8'),
      ],
    },
    options: baseOptions('ug/m3'),
  });
}

function buildChartTempHum(records) {
  buildChart('chartTempHum', {
    type: 'line',
    data: {
      labels:   timeLabels(records),
      datasets: [
        lineDataset('Temperature', records.map(r => r.temperature), '#dc2626'),
        lineDataset('Humidity',    records.map(r => r.humidity),    '#0f766e'),
      ],
    },
    options: baseOptions(),
  });
}

function buildChartCO2(records) {
  buildChart('chartCO2', {
    type: 'line',
    data: {
      labels:   timeLabels(records),
      datasets: [
        lineDataset('CO2', records.map(r => r.co2), '#d97706'),
      ],
    },
    options: baseOptions('ppm'),
  });
}

function buildChartElec(records) {
  buildChart('chartElec', {
    type: 'line',
    data: {
      labels:   timeLabels(records),
      datasets: [
        lineDataset('Voltage', records.map(r => r.voltage), '#2563eb', { yAxisID: 'yV' }),
        lineDataset('Current', records.map(r => r.current), '#0f766e', { yAxisID: 'yI' }),
        lineDataset('Power',   records.map(r => r.power),   '#d97706', { yAxisID: 'yP' }),
      ],
    },
    options: {
      ...baseOptions(),
      scales: {
        x:  AXIS,
        yV: { ...AXIS, position: 'left',  ticks: { ...TICKS, callback: v => `${v}V` } },
        yI: {
          ...AXIS,
          position: 'right',
          grid: { display: false },
          ticks: { ...TICKS, callback: v => `${v}A` },
        },
        yP: { display: false },
      },
    },
  });
}

// ── Public API ─────────────────────────────────────────────────
function initAllCharts(records) {
  if (!Array.isArray(records) || !records.length) return;
  buildChartPM(records);
  buildChartTempHum(records);
  buildChartCO2(records);
  buildChartElec(records);
}
