/**
 * @file searchFilter.js
 * @description 资产多条件 AND 过滤工具函数
 * @feat #265
 */
import { parseTags } from "./constants";

/**
 * 按多条件 AND 过滤资产列表
 * @param {Array} assets - 原始资产列表
 * @param {Object} filters - 搜索条件
 * @param {string} [filters.name] - 名称关键词（includes 匹配）
 * @param {string} [filters.assetType] - 资产分类
 * @param {string} [filters.tags] - 标签关键词
 * @param {string} [filters.scene] - 场景关键词
 * @param {string} [filters.createdBy] - 创建人关键词
 * @returns {Array} 过滤后的资产列表
 */
export const filterAssets = (assets, filters) => {
  if (!filters || !assets) return assets || [];

  return assets.filter((asset) => {
    /* 名称匹配 */
    if (filters.name) {
      const keyword = filters.name.trim().toLowerCase();
      const name = (asset.name || "").toLowerCase();
      const desc = (asset.description || "").toLowerCase();
      if (!name.includes(keyword) && !desc.includes(keyword)) return false;
    }

    /* 分类匹配 */
    if (filters.assetType) {
      if (asset.assetType !== filters.assetType) return false;
    }

    /* 标签匹配 */
    if (filters.tags) {
      const keyword = filters.tags.trim().toLowerCase();
      const tags = parseTags(asset.tags);
      const tagStr = tags.join(" ").toLowerCase();
      if (!tagStr.includes(keyword)) return false;
    }

    /* 场景匹配 */
    if (filters.scene) {
      const keyword = filters.scene.trim().toLowerCase();
      const desc = (asset.description || "").toLowerCase();
      const meta = JSON.stringify(asset.metadata || "").toLowerCase();
      const tags = parseTags(asset.tags).join(" ").toLowerCase();
      if (!desc.includes(keyword) && !meta.includes(keyword) && !tags.includes(keyword)) {
        return false;
      }
    }

    /* 创建人匹配 */
    if (filters.createdBy) {
      const keyword = filters.createdBy.trim().toLowerCase();
      const creator = (asset.createdBy || "").toLowerCase();
      if (!creator.includes(keyword)) return false;
    }

    return true;
  });
};
