/**
 * @file nodeHelpers.test.js
 * @description Tests for src/components/resource/nodeHelpers.js
 */
import {
  NODE_TYPE_COLORS,
  NODE_STATUS_MAP,
  HEALTH_CONFIG,
  parseTags,
  serializeTags,
  extractType,
  getTagColor,
  collectAllTagKeys,
  extractSource,
  parseJSON,
} from '../nodeHelpers';

describe('NODE_TYPE_COLORS', () => {
  test('has GPU, CPU, NPU, FPGA colors', () => {
    expect(NODE_TYPE_COLORS.GPU).toBe('green');
    expect(NODE_TYPE_COLORS.CPU).toBe('blue');
    expect(NODE_TYPE_COLORS.NPU).toBe('purple');
    expect(NODE_TYPE_COLORS.FPGA).toBe('orange');
  });
});

describe('NODE_STATUS_MAP', () => {
  test('has all statuses', () => {
    expect(NODE_STATUS_MAP.ONLINE.text).toBe('在线');
    expect(NODE_STATUS_MAP.OFFLINE.text).toBe('离线');
    expect(NODE_STATUS_MAP.MAINTENANCE.text).toBe('维护中');
    expect(NODE_STATUS_MAP.BUSY.text).toBe('忙碌');
    expect(NODE_STATUS_MAP.ERROR.text).toBe('异常');
  });
});

describe('HEALTH_CONFIG', () => {
  test('has all health states', () => {
    expect(HEALTH_CONFIG.HEALTHY.text).toBe('健康');
    expect(HEALTH_CONFIG.DEGRADED.text).toBe('亚健康');
    expect(HEALTH_CONFIG.UNHEALTHY.text).toBe('不健康');
  });
});

describe('parseTags', () => {
  test('returns empty array for null/undefined/empty', () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
  });

  test('parses JSON array format', () => {
    const tags = JSON.stringify([{ key: 'type', value: 'GPU' }]);
    expect(parseTags(tags)).toEqual([{ key: 'type', value: 'GPU' }]);
  });

  test('filters out invalid tags from JSON array', () => {
    const tags = JSON.stringify([{ key: 'type', value: 'GPU' }, null, { value: 'missing-key' }]);
    expect(parseTags(tags)).toEqual([{ key: 'type', value: 'GPU' }]);
  });

  test('parses comma-separated key:value format', () => {
    const result = parseTags('type:GPU,cluster:prod');
    expect(result).toEqual([
      { key: 'type', value: 'GPU' },
      { key: 'cluster', value: 'prod' },
    ]);
  });

  test('parses comma-separated key-only format', () => {
    const result = parseTags('GPU,fast');
    expect(result).toEqual([
      { key: 'GPU', value: '' },
      { key: 'fast', value: '' },
    ]);
  });

  test('handles invalid JSON gracefully', () => {
    const result = parseTags('{bad json}');
    expect(result).toEqual([{ key: '{bad json}', value: '' }]);
  });
});

describe('serializeTags', () => {
  test('returns empty string for null/empty', () => {
    expect(serializeTags(null)).toBe('');
    expect(serializeTags([])).toBe('');
  });

  test('serializes tags to JSON', () => {
    const result = serializeTags([{ key: 'type', value: 'GPU' }]);
    expect(JSON.parse(result)).toEqual([{ key: 'type', value: 'GPU' }]);
  });

  test('fills empty value', () => {
    const result = serializeTags([{ key: 'fast' }]);
    expect(JSON.parse(result)).toEqual([{ key: 'fast', value: '' }]);
  });
});

describe('extractType', () => {
  test('returns null for null/empty tags', () => {
    expect(extractType(null)).toBeNull();
    expect(extractType('')).toBeNull();
  });

  test('extracts type from type:GPU tag', () => {
    const tags = JSON.stringify([{ key: 'type', value: 'GPU' }]);
    expect(extractType(tags)).toBe('GPU');
  });

  test('extracts type from type:npu (case insensitive)', () => {
    const tags = JSON.stringify([{ key: 'Type', value: 'npu' }]);
    expect(extractType(tags)).toBe('NPU');
  });

  test('extracts type from tag key itself', () => {
    const tags = JSON.stringify([{ key: 'GPU', value: '' }]);
    expect(extractType(tags)).toBe('GPU');
  });

  test('returns null for unknown type', () => {
    const tags = JSON.stringify([{ key: 'type', value: 'TPU' }]);
    expect(extractType(tags)).toBeNull();
  });
});

describe('getTagColor', () => {
  test('returns a string color for any key', () => {
    expect(typeof getTagColor('type')).toBe('string');
    expect(typeof getTagColor('GPU')).toBe('string');
  });

  test('returns consistent color for same key', () => {
    const c1 = getTagColor('test-key');
    const c2 = getTagColor('test-key');
    expect(c1).toBe(c2);
  });
});

describe('collectAllTagKeys', () => {
  test('returns empty array for empty nodes', () => {
    expect(collectAllTagKeys([])).toEqual([]);
  });

  test('collects and deduplicates keys', () => {
    const nodes = [
      { tags: JSON.stringify([{ key: 'type', value: 'GPU' }]) },
      { tags: JSON.stringify([{ key: 'type', value: 'NPU' }, { key: 'cluster', value: 'prod' }]) },
    ];
    const keys = collectAllTagKeys(nodes);
    expect(keys).toContain('type');
    expect(keys).toContain('cluster');
    expect(keys).toHaveLength(2);
  });

  test('returns sorted keys', () => {
    const nodes = [
      { tags: JSON.stringify([{ key: 'z-key', value: '' }, { key: 'a-key', value: '' }]) },
    ];
    const keys = collectAllTagKeys(nodes);
    expect(keys[0]).toBe('a-key');
    expect(keys[1]).toBe('z-key');
  });
});

describe('extractSource', () => {
  test('returns manual for null tags', () => {
    expect(extractSource(null)).toEqual({ type: 'manual', label: '手动' });
  });

  test('returns manual for tags without source', () => {
    const tags = JSON.stringify([{ key: 'type', value: 'GPU' }]);
    expect(extractSource(tags)).toEqual({ type: 'manual', label: '手动' });
  });

  test('returns k8s source with cluster name', () => {
    const tags = JSON.stringify([
      { key: 'source', value: 'k8s' },
      { key: 'cluster', value: 'prod-cluster' },
    ]);
    expect(extractSource(tags)).toEqual({ type: 'k8s', label: 'K8s-prod-cluster' });
  });

  test('returns k8s source with unknown cluster', () => {
    const tags = JSON.stringify([{ key: 'source', value: 'k8s' }]);
    expect(extractSource(tags)).toEqual({ type: 'k8s', label: 'K8s-unknown' });
  });
});

describe('parseJSON', () => {
  test('returns null for null/undefined/empty', () => {
    expect(parseJSON(null)).toBeNull();
    expect(parseJSON(undefined)).toBeNull();
    expect(parseJSON('')).toBeNull();
  });

  test('parses valid JSON string', () => {
    expect(parseJSON('{"key":"value"}')).toEqual({ key: 'value' });
  });

  test('returns object as-is if already parsed', () => {
    const obj = { key: 'value' };
    expect(parseJSON(obj)).toBe(obj);
  });

  test('returns null for invalid JSON', () => {
    expect(parseJSON('{bad}')).toBeNull();
  });
});
