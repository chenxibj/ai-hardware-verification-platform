/**
 * @file searchFilter.test.js
 * @description Tests for src/pages/assets/searchFilter.js
 */
import { filterAssets } from '../searchFilter';

const mockAssets = [
  { name: 'ResNet50', assetType: 'MODEL', description: '图像分类模型', tags: '["computer_vision","image"]', createdBy: 'alice' },
  { name: 'BERT Base', assetType: 'MODEL', description: 'NLP模型', tags: '["nlp","text"]', createdBy: 'bob' },
  { name: 'ImageNet', assetType: 'DATASET', description: '大规模图像数据集', tags: '["image","classification"]', createdBy: 'alice' },
  { name: 'TrainScript', assetType: 'SCRIPT', description: '训练脚本', tags: '["training"]', createdBy: 'charlie' },
];

describe('filterAssets', () => {
  test('returns all assets when no filters', () => {
    expect(filterAssets(mockAssets, {})).toHaveLength(4);
    expect(filterAssets(mockAssets, null)).toHaveLength(4);
  });

  test('returns empty array for null assets', () => {
    expect(filterAssets(null, {})).toEqual([]);
  });

  test('filters by name (case insensitive)', () => {
    const result = filterAssets(mockAssets, { name: 'resnet' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ResNet50');
  });

  test('filters by name in description', () => {
    const result = filterAssets(mockAssets, { name: '图像' });
    expect(result).toHaveLength(2); // ResNet50 (图像分类模型) + ImageNet (图像数据集)
  });

  test('filters by assetType', () => {
    const result = filterAssets(mockAssets, { assetType: 'MODEL' });
    expect(result).toHaveLength(2);
  });

  test('filters by tags', () => {
    const result = filterAssets(mockAssets, { tags: 'nlp' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('BERT Base');
  });

  test('filters by createdBy', () => {
    const result = filterAssets(mockAssets, { createdBy: 'alice' });
    expect(result).toHaveLength(2);
  });

  test('AND logic: name + assetType', () => {
    const result = filterAssets(mockAssets, { name: 'ResNet', assetType: 'MODEL' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ResNet50');
  });

  test('AND logic: all filters, no match', () => {
    const result = filterAssets(mockAssets, { name: 'ResNet', assetType: 'DATASET' });
    expect(result).toHaveLength(0);
  });

  test('filters by scene keyword (searches description, metadata, tags)', () => {
    const result = filterAssets(mockAssets, { scene: 'image' });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test('handles assets with no tags gracefully', () => {
    const assets = [{ name: 'NoTags', assetType: 'MISC', tags: null }];
    const result = filterAssets(assets, { tags: 'something' });
    expect(result).toHaveLength(0);
  });
});
