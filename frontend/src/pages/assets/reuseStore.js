/**
 * @file reuseStore.js
 * @description 资产复用数据存储 — 基于 localStorage 维护资产-任务关联关系
 * @feat #267
 */

const STORAGE_KEY = "ahvp_asset_reuse_records";

/** 从 localStorage 读取所有复用记录 */
const loadAllRecords = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

/** 保存所有复用记录到 localStorage */
const saveAllRecords = (records) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* localStorage 满或不可用 — 静默失败 */
  }
};

/**
 * 获取指定资产的复用记录
 * @param {string|number} assetId
 * @returns {Array} 复用记录列表
 */
export const getAssetReuseRecords = (assetId) => {
  const all = loadAllRecords();
  return all.filter((r) => String(r.assetId) === String(assetId));
};

/**
 * 获取资产复用次数映射
 * @returns {Object} { assetId: count }
 */
export const getAssetReuseCounts = () => {
  const all = loadAllRecords();
  const counts = {};
  all.forEach((r) => {
    const key = String(r.assetId);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};

/**
 * 添加一条复用记录
 * @param {Object} record - { assetId, taskName, planName, usedAt, usedBy }
 */
export const addReuseRecord = (record) => {
  const all = loadAllRecords();
  all.push({
    assetId: record.assetId,
    taskName: record.taskName || "未命名任务",
    planName: record.planName || "",
    usedAt: record.usedAt || new Date().toISOString(),
    usedBy: record.usedBy || "system",
  });
  saveAllRecords(all);
};

/**
 * 获取热门资产 TOP N
 * @param {number} topN - 返回前 N 名
 * @returns {Array} [{ assetId, count }, ...]
 */
export const getTopAssets = (topN = 5) => {
  const counts = getAssetReuseCounts();
  return Object.entries(counts)
    .map(([assetId, count]) => ({ assetId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
};

/**
 * 初始化示例复用数据（如果 localStorage 为空）
 * 用于演示展示，真实数据由任务关联时写入
 */
export const initDemoReuseData = (assets) => {
  const existing = loadAllRecords();
  if (existing.length > 0 || !assets || assets.length === 0) return;

  const demoTasks = [
    { taskName: "ResNet50 精度评测", planName: "图像分类基准评测 v2.1" },
    { taskName: "YOLOv8 性能测试", planName: "目标检测评测计划" },
    { taskName: "BERT 推理延迟评测", planName: "NLP模型评测 Q1" },
    { taskName: "模型量化验证", planName: "部署前验证计划" },
    { taskName: "数据质量校验", planName: "数据集审核流程" },
    { taskName: "脚本兼容性测试", planName: "跨平台适配计划" },
    { taskName: "端到端流程验证", planName: "集成测试计划 v3.0" },
  ];

  const demoUsers = ["admin", "test@ahvp.com", "engineer01"];
  const records = [];

  assets.slice(0, Math.min(assets.length, 8)).forEach((asset, idx) => {
    const taskCount = Math.max(1, 3 - Math.floor(idx / 3));
    for (let t = 0; t < taskCount; t++) {
      const taskIdx = (idx + t) % demoTasks.length;
      const userIdx = (idx + t) % demoUsers.length;
      const daysAgo = (idx * 3 + t + 1) % 30 + 1; // deterministic spread across 30 days
      const usedAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
      records.push({
        assetId: asset.id,
        taskName: demoTasks[taskIdx].taskName,
        planName: demoTasks[taskIdx].planName,
        usedAt,
        usedBy: demoUsers[userIdx],
      });
    }
  });

  saveAllRecords(records);
};
