'use strict';

// ── Configuration ──────────────────────────────────────────────
const CONFIG = Object.freeze({
  appsScriptUrl:     '',     // ← paste your Web App URL here
  useLiveByDefault:  true,
  sampleIntervalMin: 15,
  maxLiveRecords:    200,
});

// ── Alert thresholds ───────────────────────────────────────────
const THRESHOLDS = Object.freeze({
  pm25:        { warn: 35,  crit: 55   },
  pm10:        { warn: 50,  crit: 80   },
  co2:         { warn: 700, crit: 1000 },
  temperature: { warn: 35,  crit: 40   },
  humidity:    { warn: 80,  crit: 90   },
  voltage:     { warn: 230, crit: 240  },
  power:       { warn: 120, crit: 150  },
});

// ── KPI card definitions ───────────────────────────────────────
const CARD_DEFS = Object.freeze([
  { key: 'pm25',        label: 'PM2.5',       unit: 'ug/m3', icon: '💨' },
  { key: 'pm10',        label: 'PM10',        unit: 'ug/m3', icon: '🌫'  },
  { key: 'temperature', label: 'Temperature', unit: 'C',     icon: '🌡' },
  { key: 'humidity',    label: 'Humidity',    unit: '%',     icon: '💧' },
  { key: 'co2',         label: 'CO2',         unit: 'ppm',   icon: '🫧' },
  { key: 'voltage',     label: 'Voltage',     unit: 'V',     icon: '⚡' },
  { key: 'current',     label: 'Current',     unit: 'A',     icon: '〰' },
  { key: 'power',       label: 'Power',       unit: 'W',     icon: '🔌' },
  { key: 'energy',      label: 'Energy',      unit: 'kWh',   icon: '🔋' },
]);

// ── Alert check keys ───────────────────────────────────────────
const ALERT_CHECKS = Object.freeze([
  { key: 'pm25',        label: 'PM2.5',       unit: 'ug/m3' },
  { key: 'pm10',        label: 'PM10',        unit: 'ug/m3' },
  { key: 'co2',         label: 'CO2',         unit: 'ppm'   },
  { key: 'temperature', label: 'Temperature', unit: 'C'     },
  { key: 'humidity',    label: 'Humidity',    unit: '%'     },
  { key: 'voltage',     label: 'Voltage',     unit: 'V'     },
  { key: 'power',       label: 'Power',       unit: 'W'     },
]);
