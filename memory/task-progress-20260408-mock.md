# Mock 数据消除任务进度 - 2026-04-08

## 状态: ✅ 全部完成

## 修改清单

### 前端 (7 个文件)

| # | 文件 | 问题 | 修法 | 状态 |
|---|------|------|------|------|
| 1 | PlanMonitor.js | `simulateResource()` 用 Math.random() 生成假 CPU/内存 | 改为真实任务统计(运行中/已完成/总计) | ✅ |
| 2 | ChipReport.js | `generateAccuracyData()` 用 Math.random() 生成假精度 | 改为从 operatorRanking pass/fail 提取真实数据 | ✅ |
| 3 | ChipReport.js | memoryUsage fallback `Math.random()` | 改为 `op.memory_delta_mb ?? null`，显示"-" | ✅ |
| 4 | ResourceMonitor.js | cpuTrend/memTrend 用 Math.random() | 移除趋势图，显示"需接入监控系统"提示 | ✅ |
| 5 | PlanList.js | 进度按状态硬编码(RUNNING=45%等) | 改为 completedTasks/totalTasks 真实计算 | ✅ |
| 6 | TaskResult.js | `generateFallbackLog()` 生成假日志 | 改为 `message.error("日志加载失败")`，不生成假内容 | ✅ |
| 7 | Workflows.js | 运行按钮模拟执行动画 | 改为"执行（开发中）"+ info message | ✅ |
| 8 | ChipReport.js + ChipProfile.js | "CPU 模拟模式" 文案 | 改为 "CPU 评测模式" / "CPU 评测 (NumPy + Python 3)" | ✅ |

### 后端 (3 个文件)

| # | 文件 | 问题 | 修法 | 状态 |
|---|------|------|------|------|
| 9 | ReportGeneratorService.java | 算子 score 读取存储的 fallback 50 | 改为从 avgLatency 实时计算: `100 - 20*log10(latency)` | ✅ |
| 10 | ReportGenerator.java | score fallback 50 + 维度 default 50.0 | 全部改为 0 | ✅ |
| 11 | EvaluationResultService.java | 维度评分用存储的 score=50 | 改为从延迟计算，新增 flattenMetrics() | ✅ |

### 部署验证

- [x] 前端 `npm run build` 成功
- [x] 前端部署到 ahvp-frontend 容器
- [x] 后端 `docker compose build --no-cache` 成功
- [x] 后端 `docker compose up -d` 重启成功
- [x] API 验证 Plans 返回 completedTasks/totalTasks
- [x] 报告重新生成 (plan 70: 65.7分, plan 94: 13.2分) — 基于真实延迟数据
- [x] 算子评分从真实延迟计算 (如 Conv2D: latency=0.36ms → score=100.0)
- [x] `git commit + push` 完成

### Git Commit
- Hash: `8c6dcc6c`
- Branch: `main`
- 11 files changed, 131 insertions(+), 93 deletions(-)
