'use strict';

// Configuration
const CONFIG = Object.freeze({
  appsScriptUrl:     '',     // Paste your Web App URL here.
  previewOnNoSource: true,
  useLiveByDefault:  true,
  sampleIntervalMin: 15,
  maxLiveRecords:    200,
});

// Alert thresholds
const THRESHOLDS = Object.freeze({
  pm25:        { warn: 35,  crit: 55   },
  pm10:        { warn: 50,  crit: 80   },
  co2:         { warn: 700, crit: 1000 },
  temperature: { warn: 35,  crit: 40   },
  humidity:    { warn: 80,  crit: 90   },
  voltage:     { warn: 230, crit: 240  },
  power:       { warn: 120, crit: 150  },
});

// Metric definitions
const CARD_DEFS = Object.freeze([
  {
    key: 'pm25',
    label: 'PM2.5',
    unit: 'ug/m3',
    tag: 'PM',
    decimals: 0,
    priority: true,
    note: 'Fine particle load',
  },
  {
    key: 'co2',
    label: 'CO2',
    unit: 'ppm',
    tag: 'CO2',
    decimals: 0,
    priority: true,
    note: 'Ventilation pressure',
  },
  {
    key: 'power',
    label: 'Power',
    unit: 'W',
    tag: 'PWR',
    decimals: 0,
    priority: true,
    note: 'Immediate load draw',
  },
  {
    key: 'temperature',
    label: 'Temperature',
    unit: 'C',
    tag: 'TMP',
    decimals: 1,
    priority: true,
    note: 'Comfort baseline',
  },
  {
    key: 'pm10',
    label: 'PM10',
    unit: 'ug/m3',
    tag: 'PM10',
    decimals: 0,
    priority: false,
    note: 'Coarse particles',
  },
  {
    key: 'humidity',
    label: 'Humidity',
    unit: '%',
    tag: 'HUM',
    decimals: 0,
    priority: false,
    note: 'Moisture level',
  },
  {
    key: 'voltage',
    label: 'Voltage',
    unit: 'V',
    tag: 'VLT',
    decimals: 0,
    priority: false,
    note: 'Supply stability',
  },
  {
    key: 'current',
    label: 'Current',
    unit: 'A',
    tag: 'AMP',
    decimals: 2,
    priority: false,
    note: 'Circuit draw',
  },
  {
    key: 'energy',
    label: 'Energy',
    unit: 'kWh',
    tag: 'ENG',
    decimals: 1,
    priority: false,
    note: 'Accumulated use',
  },
]);

// Alert check keys
const ALERT_CHECKS = Object.freeze([
  { key: 'pm25',        label: 'PM2.5',       unit: 'ug/m3' },
  { key: 'pm10',        label: 'PM10',        unit: 'ug/m3' },
  { key: 'co2',         label: 'CO2',         unit: 'ppm'   },
  { key: 'temperature', label: 'Temperature', unit: 'C'     },
  { key: 'humidity',    label: 'Humidity',    unit: '%'     },
  { key: 'voltage',     label: 'Voltage',     unit: 'V'     },
  { key: 'power',       label: 'Power',       unit: 'W'     },
]);

const STATUS_META = Object.freeze({
  normal:   { label: 'Stable',   filterLabel: 'Normal'   },
  warning:  { label: 'Warning',  filterLabel: 'Warning'  },
  critical: { label: 'Critical', filterLabel: 'Critical' },
});
