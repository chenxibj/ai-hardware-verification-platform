/**
 * @file exportPdf.test.js
 * @description Tests for src/utils/exportPdf.js
 */
import { generateReportFilename, DEFAULT_PDF_OPTIONS } from '../exportPdf';

describe('generateReportFilename', () => {
  beforeEach(() => {
    // Mock Date to get deterministic filenames
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-14T10:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('generates PDF filename with chip name and date', () => {
    const filename = generateReportFilename('NVIDIA A100');
    expect(filename).toBe('NVIDIA A100-评价报告-20260514.pdf');
  });

  test('generates CSV filename when format=csv', () => {
    const filename = generateReportFilename('NVIDIA A100', 'csv');
    expect(filename).toBe('NVIDIA A100-评价报告-20260514.csv');
  });

  test('uses default name when chipName is null', () => {
    const filename = generateReportFilename(null);
    expect(filename).toBe('芯片报告-评价报告-20260514.pdf');
  });

  test('sanitizes special characters in chip name', () => {
    const filename = generateReportFilename('Test/Chip:V2');
    expect(filename).toBe('Test_Chip_V2-评价报告-20260514.pdf');
  });

  test('pads month and day with zeros', () => {
    jest.setSystemTime(new Date('2026-01-05T10:00:00'));
    const filename = generateReportFilename('Chip');
    expect(filename).toBe('Chip-评价报告-20260105.pdf');
  });
});

describe('DEFAULT_PDF_OPTIONS', () => {
  test('has expected default values', () => {
    expect(DEFAULT_PDF_OPTIONS).toEqual({
      includeCharts: true,
      includeRawData: false,
      includeEnvironment: true,
      watermark: 'AHVP',
      pageSize: 'a4',
    });
  });
});
