/**
 * #445: Report Comparison — shared formula library
 * Mirrors backend ComparisonService.java for consistent calculations.
 *
 * Core principle: vs% > 100% = test is better, < 100% = test is worse.
 * - higher_better (throughput, bandwidth, efficiency): vsPct = test / baseline * 100
 * - lower_better (latency, volatility): vsPct = baseline / test * 100
 */

// ── Metric direction mapping ──

const METRIC_DIRECTIONS = {
  // lower_better: latency & volatility
  latencyMean: 'lower_better',
  latencyP95: 'lower_better',
  latencyP99: 'lower_better',
  latencyCV: 'lower_better',
  p95p50Ratio: 'lower_better',
  // higher_better: throughput, bandwidth, efficiency
  throughput: 'higher_better',
  busBandwidth: 'higher_better',
  memBandwidth: 'higher_better',
  gflops: 'higher_better',
  scalingEfficiency: 'higher_better',
  passRate: 'higher_better',
};

// ── Dimension configuration ──

const DIMENSION_CONFIG = {
  compute:       { primaryMetric: 'latencyMean',      direction: 'lower_better'  },
  memory:        { primaryMetric: 'latencyMean',      direction: 'lower_better'  },
  communication: { primaryMetric: 'busBandwidth',     direction: 'higher_better' },
  op_compat:     { primaryMetric: 'latencyMean',      direction: 'lower_better'  },
  training:      { primaryMetric: 'throughput',        direction: 'higher_better' },
  inference:     { primaryMetric: 'latencyMean',      direction: 'lower_better'  },
  scalability:   { primaryMetric: 'scalingEfficiency', direction: 'higher_better' },
  ecosystem:     { primaryMetric: 'passRate',          direction: 'higher_better' },
};

// ── Core formula ──

/**
 * Calculate vs percentage for a single metric.
 * @param {string} direction - "higher_better" or "lower_better"
 * @param {number} baselineValue
 * @param {number} testValue
 * @returns {number|null} vs percentage (>100 = test is better), or null if invalid
 */
export function calcVsPct(direction, baselineValue, testValue) {
  if (baselineValue <= 0 || testValue <= 0) {
    return null;
  }
  if (direction === 'lower_better') {
    return (baselineValue / testValue) * 100.0;
  }
  // higher_better (default)
  return (testValue / baselineValue) * 100.0;
}

/**
 * Get the direction for a metric name.
 * @param {string} metricName
 * @returns {string} "higher_better" or "lower_better"
 */
export function getMetricDirection(metricName) {
  return METRIC_DIRECTIONS[metricName] || 'higher_better';
}

/**
 * Get the primary metric for a dimension.
 * @param {string} dimensionKey
 * @returns {string|undefined}
 */
export function getDimensionPrimaryMetric(dimensionKey) {
  const config = DIMENSION_CONFIG[dimensionKey];
  return config ? config.primaryMetric : undefined;
}

/**
 * Get the direction for a dimension.
 * @param {string} dimensionKey
 * @returns {string|undefined}
 */
export function getDimensionDirection(dimensionKey) {
  const config = DIMENSION_CONFIG[dimensionKey];
  return config ? config.direction : undefined;
}

/**
 * Calculate dimension-level vs% by averaging primary metric vs%
 * across common operators.
 * @param {string} dimensionKey
 * @param {Array<Object>} baselineOps - [{testItem, latencyMean, throughput, ...}]
 * @param {Array<Object>} testOps
 * @returns {number|null}
 */
export function calcDimensionVsPct(dimensionKey, baselineOps, testOps) {
  const config = DIMENSION_CONFIG[dimensionKey];
  if (!config) return null;

  const { primaryMetric, direction } = config;

  // Index by testItem
  const baselineIndex = {};
  (baselineOps || []).forEach((op) => {
    if (op.testItem) baselineIndex[op.testItem] = op;
  });
  const testIndex = {};
  (testOps || []).forEach((op) => {
    if (op.testItem) testIndex[op.testItem] = op;
  });

  // Common operators
  const commonItems = Object.keys(baselineIndex).filter(
    (item) => item in testIndex
  );
  if (commonItems.length === 0) return null;

  const vsPcts = [];
  for (const item of commonItems) {
    const blVal = Number(baselineIndex[item][primaryMetric]);
    const tsVal = Number(testIndex[item][primaryMetric]);
    if (isNaN(blVal) || isNaN(tsVal)) continue;
    const pct = calcVsPct(direction, blVal, tsVal);
    if (pct !== null) vsPcts.push(pct);
  }

  if (vsPcts.length === 0) return null;
  return vsPcts.reduce((sum, v) => sum + v, 0) / vsPcts.length;
}

/**
 * Calculate overall vs% as average of non-null dimension vs%.
 * @param {Object<string, number|null>} dimensionVsPcts
 * @returns {number|null}
 */
export function calcOverallVsPct(dimensionVsPcts) {
  const valid = Object.values(dimensionVsPcts).filter((v) => v !== null && v !== undefined);
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/**
 * Round to 2 decimal places.
 * @param {number} value
 * @returns {number}
 */
export function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Format vs% with color hint.
 * @param {number|null} vsPct
 * @returns {{ text: string, color: string }}
 */
export function formatVsPct(vsPct) {
  if (vsPct === null || vsPct === undefined) {
    return { text: '—', color: 'default' };
  }
  const rounded = round2(vsPct);
  if (rounded > 100) {
    return { text: `${rounded}%`, color: 'green' };
  } else if (rounded < 100) {
    return { text: `${rounded}%`, color: 'red' };
  }
  return { text: '100%', color: 'default' };
}

// Named exports above for tree-shaking; also a named default for convenience
const comparisonUtils = {
  calcVsPct,
  getMetricDirection,
  getDimensionPrimaryMetric,
  getDimensionDirection,
  calcDimensionVsPct,
  calcOverallVsPct,
  round2,
  formatVsPct,
  METRIC_DIRECTIONS,
  DIMENSION_CONFIG,
};

export default comparisonUtils;
