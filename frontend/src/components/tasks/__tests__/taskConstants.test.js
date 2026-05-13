/**
 * @file taskConstants.test.js
 * @description Tests for task constants
 */
import {
  EVAL_TYPES,
  PRIORITIES,
  PRIORITY_COLORS,
  STATUS_MAP,
  STATUS_COLORS,
  PRESET_TEMPLATES,
  GPU_OPTIONS,
  PRECISION_OPTIONS,
} from '../taskConstants';

describe('EVAL_TYPES', () => {
  test('has 5 evaluation types', () => {
    expect(Object.keys(EVAL_TYPES)).toHaveLength(5);
    expect(EVAL_TYPES.PERFORMANCE).toBe('性能评测');
    expect(EVAL_TYPES.ACCURACY).toBe('精度评测');
    expect(EVAL_TYPES.COMPATIBILITY).toBe('兼容性评测');
    expect(EVAL_TYPES.STABILITY).toBe('稳定性评测');
    expect(EVAL_TYPES.GENERAL).toBe('通用评测');
  });
});

describe('PRIORITIES', () => {
  test('has HIGH, MEDIUM, LOW', () => {
    expect(PRIORITIES.HIGH).toBe('高');
    expect(PRIORITIES.MEDIUM).toBe('中');
    expect(PRIORITIES.LOW).toBe('低');
  });
});

describe('PRIORITY_COLORS', () => {
  test('maps priorities to colors', () => {
    expect(PRIORITY_COLORS.HIGH).toBe('red');
    expect(PRIORITY_COLORS.MEDIUM).toBe('blue');
    expect(PRIORITY_COLORS.LOW).toBe('default');
  });
});

describe('STATUS_MAP', () => {
  test('has all 7 status mappings', () => {
    expect(Object.keys(STATUS_MAP)).toHaveLength(7);
    expect(STATUS_MAP.PENDING).toBe('待执行');
    expect(STATUS_MAP.RUNNING).toBe('执行中');
    expect(STATUS_MAP.COMPLETED).toBe('已完成');
    expect(STATUS_MAP.FAILED).toBe('失败');
  });
});

describe('STATUS_COLORS', () => {
  test('has matching keys with STATUS_MAP', () => {
    expect(Object.keys(STATUS_COLORS).sort()).toEqual(Object.keys(STATUS_MAP).sort());
  });

  test('COMPLETED is success, FAILED is error, RUNNING is processing', () => {
    expect(STATUS_COLORS.COMPLETED).toBe('success');
    expect(STATUS_COLORS.FAILED).toBe('error');
    expect(STATUS_COLORS.RUNNING).toBe('processing');
  });
});

describe('PRESET_TEMPLATES', () => {
  test('has 6 templates', () => {
    expect(PRESET_TEMPLATES).toHaveLength(6);
  });

  test('each template has required fields', () => {
    PRESET_TEMPLATES.forEach(t => {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.evalType).toBeTruthy();
      expect(t.desc).toBeTruthy();
      expect(t.metrics).toBeDefined();
      expect(t.metrics.length).toBeGreaterThan(0);
    });
  });

  test('first template is chip performance', () => {
    expect(PRESET_TEMPLATES[0].id).toBe('chip_perf');
    expect(PRESET_TEMPLATES[0].name).toBe('芯片性能评测');
    expect(PRESET_TEMPLATES[0].evalType).toBe('PERFORMANCE');
  });
});

describe('GPU_OPTIONS', () => {
  test('has 6 GPU options', () => {
    expect(GPU_OPTIONS).toHaveLength(6);
  });

  test('each option has value and label', () => {
    GPU_OPTIONS.forEach(opt => {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
    });
  });

  test('includes ascend 910B', () => {
    const ascend = GPU_OPTIONS.find(o => o.value === 'ascend_910b');
    expect(ascend).toBeDefined();
    expect(ascend.label).toContain('昇腾 910B');
  });
});

describe('PRECISION_OPTIONS', () => {
  test('has 4 precision options', () => {
    expect(PRECISION_OPTIONS).toHaveLength(4);
  });

  test('includes FP32, FP16, BF16, INT8', () => {
    const values = PRECISION_OPTIONS.map(o => o.value);
    expect(values).toEqual(['FP32', 'FP16', 'BF16', 'INT8']);
  });
});
