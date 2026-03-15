'use strict';

const CHARTS = Object.create(null);
const COMPACT_MEDIA = window.matchMedia('(max-width: 720px)');
let chartDefaultsReady = false;
const TIME_ONLY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function chartToken(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function chartPalette() {
  return {
    compact: COMPACT_MEDIA.matches,
    text: chartToken('--text', '#eef3fa'),
    muted: chartToken('--text-2', '#95a5b7'),
    surface: chartToken('--surface-strong', '#1a2432'),
    grid: chartToken('--chart-grid', 'rgba(255, 255, 255, 0.06)'),
    pm25: chartToken('--chart-pm25', '#d5a35d'),
    pm10: chartToken('--chart-pm10', '#7f92ab'),
    co2: chartToken('--chart-co2', '#7ca6eb'),
    temperature: chartToken('--chart-temp', '#ec8c7f'),
    humidity: chartToken('--chart-humidity', '#70c4b6'),
    voltage: chartToken('--chart-voltage', '#92a3ff'),
    current: chartToken('--chart-current', '#63d0be'),
    power: chartToken('--chart-power', '#e2b166'),
  };
}

function colorWithAlpha(hex, alpha) {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function timeLabel(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return TIME_ONLY_FORMATTER.format(value);
  }

  const date = new Date(String(value || '').replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value || '');
  return TIME_ONLY_FORMATTER.format(date);
}

function createChartModel(records) {
  return {
    labels: records.map(record => timeLabel(record.dateMs ?? record.timestamp)),
    pm25: records.map(record => record.pm25),
    pm10: records.map(record => record.pm10),
    co2: records.map(record => record.co2),
    temperature: records.map(record => record.temperature),
    humidity: records.map(record => record.humidity),
    voltage: records.map(record => record.voltage),
    current: records.map(record => record.current),
    power: records.map(record => record.power),
  };
}

function lineDataset(label, values, color, extra = {}) {
  return {
    label,
    data: values,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2.2,
    pointRadius: 0,
    pointHoverRadius: 3,
    pointHitRadius: 10,
    tension: 0.26,
    cubicInterpolationMode: 'monotone',
    spanGaps: true,
    fill: false,
    ...extra,
  };
}

function tickConfig(palette, callback) {
  return {
    color: palette.muted,
    maxTicksLimit: palette.compact ? 4 : 6,
    padding: palette.compact ? 6 : 8,
    maxRotation: 0,
    callback,
  };
}

function axisConfig(palette, extra = {}) {
  return {
    border: { display: false },
    grid: {
      color: palette.grid,
      drawTicks: false,
    },
    ticks: tickConfig(palette),
    ...extra,
  };
}

function defaultTooltipLabel(unit) {
  return context => {
    const suffix = unit ? ` ${unit}` : '';
    return `${context.dataset.label}: ${context.parsed.y}${suffix}`;
  };
}

function baseOptions(palette, options = {}) {
  const legend = Boolean(options.legend);
  const unit = options.unit || '';

  ensureChartDefaults();

  return {
    responsive: true,
    maintainAspectRatio: false,
    normalized: true,
    resizeDelay: 80,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    layout: {
      padding: {
        top: 4,
        right: 2,
        bottom: 0,
        left: 0,
      },
    },
    elements: {
      line: {
        capBezierPoints: true,
      },
    },
    plugins: {
      legend: {
        display: legend && !palette.compact,
        position: 'top',
        align: 'start',
        labels: {
          color: palette.muted,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          boxHeight: 8,
          padding: 14,
        },
      },
      tooltip: {
        backgroundColor: colorWithAlpha('0f1722', 0.96),
        borderColor: colorWithAlpha('d2ad74', 0.22),
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        titleColor: palette.text,
        bodyColor: palette.text,
        cornerRadius: 12,
        callbacks: {
          label: options.tooltipLabel || defaultTooltipLabel(unit),
        },
      },
    },
    scales: options.scales || {
      x: axisConfig(palette),
      y: axisConfig(palette, {
        ticks: tickConfig(palette, value => (unit ? `${value} ${unit}` : value)),
      }),
    },
  };
}

function ensureChartDefaults() {
  if (chartDefaultsReady) return;
  Chart.defaults.font.family = "'Instrument Sans', sans-serif";
  Chart.defaults.animation = false;
  Chart.defaults.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  chartDefaultsReady = true;
}

function upsertChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const existing = CHARTS[canvasId];
  if (!existing) {
    CHARTS[canvasId] = new Chart(canvas.getContext('2d'), config);
    return CHARTS[canvasId];
  }

  existing.data.labels = config.data.labels;
  existing.data.datasets = config.data.datasets;
  existing.options = config.options;
  existing.update('none');
  return existing;
}

function buildChartPM(model, palette) {
  upsertChart('chartPM', {
    type: 'line',
    data: {
      labels: model.labels,
      datasets: [
        lineDataset('PM2.5', model.pm25, palette.pm25, {
          fill: true,
          backgroundColor: colorWithAlpha(palette.pm25, 0.08),
        }),
        lineDataset('PM10', model.pm10, palette.pm10),
      ],
    },
    options: baseOptions(palette, { legend: true, unit: 'ug/m3' }),
  });
}

function buildChartCO2(model, palette) {
  upsertChart('chartCO2', {
    type: 'line',
    data: {
      labels: model.labels,
      datasets: [
        lineDataset('CO2', model.co2, palette.co2, {
          fill: true,
          backgroundColor: colorWithAlpha(palette.co2, 0.08),
        }),
      ],
    },
    options: baseOptions(palette, { unit: 'ppm' }),
  });
}

function buildChartTempHum(model, palette) {
  upsertChart('chartTempHum', {
    type: 'line',
    data: {
      labels: model.labels,
      datasets: [
        lineDataset('Temperature', model.temperature, palette.temperature, { yAxisID: 'yTemp' }),
        lineDataset('Humidity', model.humidity, palette.humidity, { yAxisID: 'yHum' }),
      ],
    },
    options: baseOptions(palette, {
      legend: true,
      scales: {
        x: axisConfig(palette),
        yTemp: axisConfig(palette, {
          position: 'left',
          ticks: tickConfig(palette, value => `${value} C`),
        }),
        yHum: axisConfig(palette, {
          position: 'right',
          grid: { display: false },
          ticks: tickConfig(palette, value => `${value}%`),
        }),
      },
      tooltipLabel: context => {
        const suffix = context.dataset.label === 'Humidity' ? '%' : ' C';
        return `${context.dataset.label}: ${context.parsed.y}${suffix}`;
      },
    }),
  });
}

function buildChartElectrical(model, palette) {
  upsertChart('chartElec', {
    type: 'line',
    data: {
      labels: model.labels,
      datasets: [
        lineDataset('Voltage', model.voltage, palette.voltage, { yAxisID: 'yVolt' }),
        lineDataset('Current', model.current, palette.current, { yAxisID: 'yCurrent' }),
      ],
    },
    options: baseOptions(palette, {
      legend: true,
      scales: {
        x: axisConfig(palette),
        yVolt: axisConfig(palette, {
          position: 'left',
          ticks: tickConfig(palette, value => `${value} V`),
        }),
        yCurrent: axisConfig(palette, {
          position: 'right',
          grid: { display: false },
          ticks: tickConfig(palette, value => `${value} A`),
        }),
      },
      tooltipLabel: context => {
        const suffix = context.dataset.label === 'Voltage' ? ' V' : ' A';
        return `${context.dataset.label}: ${context.parsed.y}${suffix}`;
      },
    }),
  });
}

function buildChartPower(model, palette) {
  upsertChart('chartPower', {
    type: 'line',
    data: {
      labels: model.labels,
      datasets: [
        lineDataset('Power', model.power, palette.power, {
          fill: true,
          backgroundColor: colorWithAlpha(palette.power, 0.12),
        }),
      ],
    },
    options: baseOptions(palette, { unit: 'W' }),
  });
}

function initAllCharts(records) {
  if (!Array.isArray(records) || !records.length) return;

  const palette = chartPalette();
  const model = createChartModel(records);

  buildChartPM(model, palette);
  buildChartCO2(model, palette);
  buildChartTempHum(model, palette);
  buildChartElectrical(model, palette);
  buildChartPower(model, palette);
}
