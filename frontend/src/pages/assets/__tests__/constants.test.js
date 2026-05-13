/**
 * @file assetConstants.test.js
 * @description Tests for src/pages/assets/constants.js
 */
import {
  ASSET_TYPES,
  CATEGORY_TREE,
  UPLOAD_ASSET_TYPES,
  getTypeInfo,
  formatFileSize,
  parseTags,
} from '../constants';

describe('ASSET_TYPES', () => {
  test('has expected types', () => {
    const keys = Object.keys(ASSET_TYPES);
    expect(keys).toContain('MODEL');
    expect(keys).toContain('DATASET');
    expect(keys).toContain('OPERATOR');
    expect(keys).toContain('SCRIPT');
    expect(keys).toContain('MISC');
  });

  test('each type has label, icon, color', () => {
    Object.values(ASSET_TYPES).forEach(t => {
      expect(t.label).toBeTruthy();
      expect(t.icon).toBeDefined();
      expect(t.color).toBeTruthy();
    });
  });
});

describe('CATEGORY_TREE', () => {
  test('first item is "全部资产"', () => {
    expect(CATEGORY_TREE[0].key).toBe('all');
    expect(CATEGORY_TREE[0].label).toBe('全部资产');
  });

  test('MODEL category has children', () => {
    const model = CATEGORY_TREE.find(c => c.key === 'MODEL');
    expect(model).toBeDefined();
    expect(model.children.length).toBeGreaterThan(0);
  });

  test('DATASET category has children', () => {
    const dataset = CATEGORY_TREE.find(c => c.key === 'DATASET');
    expect(dataset).toBeDefined();
    expect(dataset.children.length).toBeGreaterThan(0);
  });
});

describe('UPLOAD_ASSET_TYPES', () => {
  test('has 5 upload types', () => {
    expect(UPLOAD_ASSET_TYPES).toHaveLength(5);
  });

  test('each has value, label, formats, maxSize', () => {
    UPLOAD_ASSET_TYPES.forEach(t => {
      expect(t.value).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.formats).toBeTruthy();
      expect(t.maxSize).toBeTruthy();
    });
  });
});

describe('getTypeInfo', () => {
  test('returns type info for known type', () => {
    const info = getTypeInfo('MODEL');
    expect(info.label).toBe('模型');
  });

  test('returns MISC for unknown type', () => {
    const info = getTypeInfo('UNKNOWN');
    expect(info.label).toBe('其他');
  });
});

describe('formatFileSize', () => {
  test('returns "-" for null/undefined/0', () => {
    expect(formatFileSize(null)).toBe('-');
    expect(formatFileSize(undefined)).toBe('-');
    expect(formatFileSize(0)).toBe('-');
  });

  test('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  test('formats KB', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  test('formats MB', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  test('formats GB', () => {
    expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
  });
});

describe('parseTags', () => {
  test('returns empty array for null/undefined/empty', () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
  });

  test('parses JSON array', () => {
    expect(parseTags('["tag1","tag2"]')).toEqual(['tag1', 'tag2']);
  });

  test('parses JSON object to key:value strings', () => {
    expect(parseTags('{"key":"value"}')).toEqual(['key:value']);
  });

  test('parses comma-separated string', () => {
    expect(parseTags('tag1,tag2,tag3')).toEqual(['tag1', 'tag2', 'tag3']);
  });

  test('handles already-parsed array', () => {
    expect(parseTags(['a', 'b'])).toEqual(['a', 'b']);
  });

  test('handles invalid JSON by falling back to comma split', () => {
    expect(parseTags('not,json')).toEqual(['not', 'json']);
  });
});
