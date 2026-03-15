'use strict';

const CHARTS = {};

function chartToken(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function chartPalette() {
  return {
    compact: window.matchMedia('(max-width: 640px)').matches,
    text: chartToken('--text', '#14212b'),
    muted: chartToken('--text-2', '#5f7283'),
    grid: chartToken('--chart-grid', 'rgba(194, 204, 212, 0.7)'),
    surface: chartToken('--surface-strong', '#fcfefd'),
    pm25: chartToken('--chart-pm25', '#c2410c'),
    pm10: chartToken('--chart-pm10', '#7b8794'),
    co2: chartToken('--chart-co2', '#a16207'),
    temperature: chartToken('--chart-temp', '#dc2626'),
    humidity: chartToken('--chart-humidity', '#0f766e'),
    voltage: chartToken('--chart-voltage', '#2563eb'),
    current: chartToken('--chart-current', '#0f766e'),
    power: chartToken('--chart-power', '#b45309'),
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

function lineDataset(label, values, color, extra = {}) {
  return {
    label,
    data:             values,
    borderColor:      color,
    backgroundColor:  color,
    borderWidth:      2.5,
    fill:             false,
    tension:          0.28,
    pointRadius:      0,
    pointHoverRadius: 4,
    pointHitRadius:   12,
    ...extra,
  };
}

function timeLabels(records) {
  return records.map(record => {
    const date = new Date(String(record.timestamp || '').replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(record.timestamp || '');
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  });
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
    grid:   { color: palette.grid, drawTicks: false },
    ticks:  tickConfig(palette),
    ...extra,
  };
}

function baseOptions(options = {}) {
  const palette = chartPalette();
  const yUnit = options.yUnit || '';
  const legend = options.legend !== false;
  const yCallback = options.yCallback || (value => (yUnit ? `${value} ${yUnit}` : value));
  const scales = options.scales || {
    x: axisConfig(palette),
    y: axisConfig(palette, { ticks: tickConfig(palette, yCallback) }),
  };

  Chart.defaults.color = palette.muted;
  Chart.defaults.borderColor = palette.grid;
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.animation = false;

  return {
    responsive:          true,
    maintainAspectRatio: false,
    interaction:         { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display:  legend,
        position: 'top',
        align:    'start',
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: palette.compact ? 12 : 16,
          color: palette.muted,
        },
      },
      tooltip: {
        backgroundColor: palette.text,
        borderWidth:     0,
        padding:         10,
        titleColor:      palette.surface,
        bodyColor:       palette.surface,
        displayColors:   true,
        cornerRadius:    12,
        callbacks: {
          label: context => {
            const suffix = yUnit ? ` ${yUnit}` : '';
            return `${context.dataset.label}: ${context.parsed.y}${suffix}`;
          },
        },
      },
    },
    scales,
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

function buildChartPM(records) {
  const palette = chartPalette();
  buildChart('chartPM', {
    type: 'line',
    data: {
      labels: timeLabels(records),
      datasets: [
        lineDataset('PM2.5', records.map(record => record.pm25), palette.pm25),
        lineDataset('PM10', records.map(record => record.pm10), palette.pm10),
      ],
    },
    options: baseOptions({ yUnit: 'ug/m3' }),
  });
}

function buildChartCO2(records) {
  const palette = chartPalette();
  buildChart('chartCO2', {
    type: 'line',
    data: {
      labels: timeLabels(records),
      datasets: [
        lineDataset('CO2', records.map(record => record.co2), palette.co2),
      ],
    },
    options: baseOptions({ yUnit: 'ppm' }),
  });
}

function buildChartTempHum(records) {
  const palette = chartPalette();
  buildChart('chartTempHum', {
    type: 'line',
    data: {
      labels: timeLabels(records),
      datasets: [
        lineDataset('Temperature', records.map(record => record.temperature), palette.temperature, { yAxisID: 'yTemp' }),
        lineDataset('Humidity', records.map(record => record.humidity), palette.humidity, { yAxisID: 'yHum' }),
      ],
    },
    options: baseOptions({
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
    }),
  });
}

function buildChartElec(records) {
  const palette = chartPalette();
  buildChart('chartElec', {
    type: 'line',
    data: {
      labels: timeLabels(records),
      datasets: [
        lineDataset('Voltage', records.map(record => record.voltage), palette.voltage, { yAxisID: 'yVolt' }),
        lineDataset('Current', records.map(record => record.current), palette.current, { yAxisID: 'yCurrent' }),
      ],
    },
    options: baseOptions({
      scales: {
        x: axisConfig(palette),
        yVolt: axisConfig(palette, {
          position: 'left',
          ticks: tickConfig(palette, value => `${value}V`),
        }),
        yCurrent: axisConfig(palette, {
          position: 'right',
          grid: { display: false },
          ticks: tickConfig(palette, value => `${value}A`),
        }),
      },
    }),
  });
}

function buildChartPower(records) {
  const palette = chartPalette();
  buildChart('chartPower', {
    type: 'line',
    data: {
      labels: timeLabels(records),
      datasets: [
        lineDataset('Power', records.map(record => record.power), palette.power, {
          fill: true,
          backgroundColor: colorWithAlpha(palette.power, 0.14),
        }),
      ],
    },
    options: baseOptions({ yUnit: 'W' }),
  });
}

function initAllCharts(records) {
  if (!Array.isArray(records) || !records.length) return;
  buildChartPM(records);
  buildChartCO2(records);
  buildChartTempHum(records);
  buildChartElec(records);
  buildChartPower(records);
}
