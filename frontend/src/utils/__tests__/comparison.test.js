/**
 * #445: Frontend comparison formula tests
 * Must be consistent with backend ComparisonServiceTest.java
 */
import {
  calcVsPct,
  getMetricDirection,
  getDimensionPrimaryMetric,
  getDimensionDirection,
  calcDimensionVsPct,
  calcOverallVsPct,
  round2,
  formatVsPct,
} from '../comparison';

// Helper
const r2 = (v) => Math.round(v * 100) / 100;

// ── calcVsPct: 9 consistency test cases (mirrors backend) ──

describe('calcVsPct', () => {
  test('延迟-被测更快: baseline=0.022, test=0.019, lower_better → 115.79', () => {
    const result = calcVsPct('lower_better', 0.022, 0.019);
    expect(result).not.toBeNull();
    expect(r2(result)).toBeCloseTo(115.79, 1);
  });

  test('延迟-被测更慢: baseline=0.022, test=0.028, lower_better → 78.57', () => {
    const result = calcVsPct('lower_better', 0.022, 0.028);
    expect(result).not.toBeNull();
    expect(r2(result)).toBeCloseTo(78.57, 1);
  });

  test('延迟-相同: baseline=0.022, test=0.022, lower_better → 100.00', () => {
    const result = calcVsPct('lower_better', 0.022, 0.022);
    expect(result).not.toBeNull();
    expect(r2(result)).toBeCloseTo(100.0, 1);
  });

  test('吞吐-被测更高: baseline=23027, test=26316, higher_better → 114.28', () => {
    const result = calcVsPct('higher_better', 23027, 26316);
    expect(result).not.toBeNull();
    expect(r2(result)).toBeCloseTo(114.28, 1);
  });

  test('吞吐-被测更低: baseline=23027, test=17857, higher_better → 77.55', () => {
    const result = calcVsPct('higher_better', 23027, 17857);
    expect(result).not.toBeNull();
    expect(r2(result)).toBeCloseTo(77.55, 1);
  });

  test('吞吐-相同: baseline=23027, test=23027, higher_better → 100.00', () => {
    const result = calcVsPct('higher_better', 23027, 23027);
    expect(result).not.toBeNull();
    expect(r2(result)).toBeCloseTo(100.0, 1);
  });

  test('基准值为0: baseline=0, test=0.019, lower_better → null', () => {
    expect(calcVsPct('lower_better', 0, 0.019)).toBeNull();
  });

  test('被测值为0: baseline=0.022, test=0, lower_better → null', () => {
    expect(calcVsPct('lower_better', 0.022, 0)).toBeNull();
  });

  test('负值: baseline=-1, test=0.019, lower_better → null', () => {
    expect(calcVsPct('lower_better', -1, 0.019)).toBeNull();
  });
});

// ── Metric direction ──

describe('getMetricDirection', () => {
  test('latencyMean → lower_better', () => {
    expect(getMetricDirection('latencyMean')).toBe('lower_better');
  });

  test('latencyP95 → lower_better', () => {
    expect(getMetricDirection('latencyP95')).toBe('lower_better');
  });

  test('latencyP99 → lower_better', () => {
    expect(getMetricDirection('latencyP99')).toBe('lower_better');
  });

  test('latencyCV → lower_better', () => {
    expect(getMetricDirection('latencyCV')).toBe('lower_better');
  });

  test('p95p50Ratio → lower_better', () => {
    expect(getMetricDirection('p95p50Ratio')).toBe('lower_better');
  });

  test('throughput → higher_better', () => {
    expect(getMetricDirection('throughput')).toBe('higher_better');
  });

  test('busBandwidth → higher_better', () => {
    expect(getMetricDirection('busBandwidth')).toBe('higher_better');
  });

  test('memBandwidth → higher_better', () => {
    expect(getMetricDirection('memBandwidth')).toBe('higher_better');
  });

  test('gflops → higher_better', () => {
    expect(getMetricDirection('gflops')).toBe('higher_better');
  });

  test('scalingEfficiency → higher_better', () => {
    expect(getMetricDirection('scalingEfficiency')).toBe('higher_better');
  });

  test('passRate → higher_better', () => {
    expect(getMetricDirection('passRate')).toBe('higher_better');
  });

  test('unknown metric → higher_better (default)', () => {
    expect(getMetricDirection('unknownMetric')).toBe('higher_better');
  });
});

// ── Dimension config ──

describe('dimension config', () => {
  test('compute → latencyMean / lower_better', () => {
    expect(getDimensionPrimaryMetric('compute')).toBe('latencyMean');
    expect(getDimensionDirection('compute')).toBe('lower_better');
  });

  test('training → throughput / higher_better', () => {
    expect(getDimensionPrimaryMetric('training')).toBe('throughput');
    expect(getDimensionDirection('training')).toBe('higher_better');
  });

  test('communication → busBandwidth / higher_better', () => {
    expect(getDimensionPrimaryMetric('communication')).toBe('busBandwidth');
    expect(getDimensionDirection('communication')).toBe('higher_better');
  });

  test('unknown dimension → undefined', () => {
    expect(getDimensionPrimaryMetric('nonexistent')).toBeUndefined();
    expect(getDimensionDirection('nonexistent')).toBeUndefined();
  });
});

// ── Dimension aggregation ──

describe('calcDimensionVsPct', () => {
  const makeOp = (testItem, dimension, latencyMean, throughput) => ({
    testItem,
    dimension,
    latencyMean,
    throughput,
    dataStatus: 'VALID',
    passed: true,
  });

  test('compute dimension: 2 common ops → average of latencyMean vs%', () => {
    const baselineOps = [
      makeOp('MatMul', '计算', 0.022, 23027),
      makeOp('Conv2D', '计算', 0.018, 25000),
    ];
    const testOps = [
      makeOp('MatMul', '计算', 0.019, 26316),
      makeOp('Conv2D', '计算', 0.016, 28000),
    ];
    const result = calcDimensionVsPct('compute', baselineOps, testOps);
    expect(result).not.toBeNull();
    // (0.022/0.019*100 + 0.018/0.016*100) / 2 = (115.789 + 112.5) / 2 = 114.14
    expect(r2(result)).toBeCloseTo(114.14, 0);
  });

  test('communication dimension: busBandwidth higher_better', () => {
    const baselineOps = [
      { testItem: 'AllReduce', dimension: '通信', busBandwidth: 800.0, dataStatus: 'VALID' },
    ];
    const testOps = [
      { testItem: 'AllReduce', dimension: '通信', busBandwidth: 720.0, dataStatus: 'VALID' },
    ];
    const result = calcDimensionVsPct('communication', baselineOps, testOps);
    expect(result).not.toBeNull();
    // 720/800*100 = 90.0
    expect(r2(result)).toBeCloseTo(90.0, 1);
  });

  test('no common operators → null', () => {
    const baselineOps = [makeOp('MatMul', '计算', 0.022, 23027)];
    const testOps = [makeOp('Conv2D', '计算', 0.016, 28000)];
    expect(calcDimensionVsPct('compute', baselineOps, testOps)).toBeNull();
  });

  test('zero value in common ops → null', () => {
    const baselineOps = [makeOp('MatMul', '计算', 0.0, 0)];
    const testOps = [makeOp('MatMul', '计算', 0.019, 26316)];
    expect(calcDimensionVsPct('compute', baselineOps, testOps)).toBeNull();
  });
});

// ── Overall vs% ──

describe('calcOverallVsPct', () => {
  test('averages non-null dimensions', () => {
    const dims = { compute: 115.0, memory: 95.0, communication: null };
    expect(calcOverallVsPct(dims)).toBeCloseTo(105.0, 1);
  });

  test('all null → null', () => {
    expect(calcOverallVsPct({ compute: null, memory: null })).toBeNull();
  });
});

// ── Utilities ──

describe('round2', () => {
  test('rounds to 2 decimal places', () => {
    expect(round2(115.789)).toBe(115.79);
    expect(round2(100.0)).toBe(100);
    expect(round2(78.571)).toBe(78.57);
  });
});

describe('formatVsPct', () => {
  test('null → dash', () => {
    expect(formatVsPct(null)).toEqual({ text: '—', color: 'default' });
  });

  test('>100 → green', () => {
    const f = formatVsPct(115.79);
    expect(f.text).toBe('115.79%');
    expect(f.color).toBe('green');
  });

  test('<100 → red', () => {
    const f = formatVsPct(78.57);
    expect(f.text).toBe('78.57%');
    expect(f.color).toBe('red');
  });

  test('100 → default', () => {
    const f = formatVsPct(100.0);
    expect(f.text).toBe('100%');
    expect(f.color).toBe('default');
  });
});
