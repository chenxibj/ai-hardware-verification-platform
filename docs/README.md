# 📚 AHVP 设计文档索引

> 所有需求必须先出设计文档，再拆 issue，再开发。

## 目录结构

```
docs/
├── README.md                          ← 本文件（索引）
├── PRD-客户原始需求文档.md              ← 客户原始 PRD
├── api-reference.md                    ← API 接口文档
├── FRONTEND-RULES.md                   ← 前端开发规范
├── test-report.md                      ← 测试报告
├── product-design/                     ← 产品设计文档
│   ├── 📦 整体产品设计
│   ├── 📊 评测模块
│   ├── 📋 报告与资产
│   ├── 🖥️ 资源管理
│   └── 📝 评审记录
└── tech-design/                        ← 技术设计文档
    ├── 🏗️ 系统架构
    ├── 🔧 模块详设
    └── 📝 评审记录
```

---

## 📌 产品设计文档（product-design/）

### 整体产品设计
| 文档 | 版本 | 状态 | 说明 |
|------|------|------|------|
| [product-design-v3.2.md](product-design/product-design-v3.2.md) | v3.2 | ✅ 最新 | 整体产品设计（含交互、US、操作闭环） |
| [product-overview-design-v2.md](product-design/product-overview-design-v2.md) | v2 | 📦 归档 | 产品总览设计 |
| [product-design-v3.1.md](product-design/product-design-v3.1.md) | v3.1 | 📦 归档 | |
| [product-design-v3.0.md](product-design/product-design-v3.0.md) | v3.0 | 📦 归档 | |

### 评测模块
| 文档 | 版本 | 状态 | 说明 |
|------|------|------|------|
| [evaluation-module-redesign-v2.2.md](product-design/evaluation-module-redesign-v2.2.md) | v2.2 | ✅ 最新 | 评测模块重构设计 |
| [operator-eval-design.md](product-design/operator-eval-design.md) | v1 | ✅ 有效 | 算子评测设计 |
| [evaluation-module-redesign-v2.1.md](product-design/evaluation-module-redesign-v2.1.md) | v2.1 | 📦 归档 | |
| [evaluation-module-redesign-v2.md](product-design/evaluation-module-redesign-v2.md) | v2 | 📦 归档 | |
| [evaluation-module-redesign-v1.md](product-design/evaluation-module-redesign-v1.md) | v1 | 📦 归档 | |

### 报告与数字资产
| 文档 | 版本 | 状态 | 说明 |
|------|------|------|------|
| [ahvp-report-template-enhancement.md](product-design/ahvp-report-template-enhancement.md) | v1 | ✅ 有效 | 报告模板增强 |
| [report-comparison-design.md](product-design/report-comparison-design.md) | v1 | ✅ 有效 | 报告对比设计 |
| [digital-assets-prd.md](product-design/digital-assets-prd.md) | v1 | ✅ 有效 | 数字资产管理 PRD |
| [log-management-prd.md](product-design/log-management-prd.md) | v1 | ✅ 有效 | 日志管理 PRD |

### 资源管理
| 文档 | 版本 | 状态 | 说明 |
|------|------|------|------|
| [resource-management-prd.md](product-design/resource-management-prd.md) | v1 | ✅ 有效 | 资源管理 PRD |

### 评审记录（Review）
| 文档 | 关联 |
|------|------|
| [operator-eval-design-review.md](product-design/operator-eval-design-review.md) | ← 算子评测 |
| [resource-management-prd-review.md](product-design/resource-management-prd-review.md) | ← 资源管理 |
| [log-management-prd-review.md](product-design/log-management-prd-review.md) | ← 日志管理 |
| [digital-assets-prd-review.md](product-design/digital-assets-prd-review.md) | ← 数字资产 |
| [log-system-redesign-review.md](product-design/log-system-redesign-review.md) | ← 日志系统重构 |

---

## 🔧 技术设计文档（tech-design/）

### 系统架构与方案
| 编号 | 文档 | 状态 | 说明 |
|------|------|------|------|
| 01 | [第一期技术方案-CPU系统](tech-design/01-第一期技术方案-CPU%20系统.md) | ✅ 有效 | CPU 评测系统整体方案 |
| 02 | [计算节点Agent技术方案](tech-design/02-计算节点Agent技术方案.md) | ✅ 有效 | Agent 架构 |
| 03 | [评测任务调度与分发](tech-design/03-评测任务调度与分发技术方案.md) | ✅ 有效 | 调度分发设计 |
| 04 | [模块详细设计-用户故事与交互](tech-design/04-模块详细设计-用户故事与交互.md) | ✅ 有效 | US + 交互流程 |
| 05 | [评测报告全流程设计方案](tech-design/05-评测报告全流程设计方案.md) | ✅ 有效 | 报告生成 pipeline v3.0 |
| 06 | [Baseline基准数据管理](tech-design/06-Baseline基准数据管理设计.md) | ✅ 有效 | 基准线管理 |
| 07 | [日志系统重构方案](tech-design/07-日志系统重构方案.md) | ✅ 有效 | 日志 v2 |
| 08 | [GPU资源管理设计](tech-design/08-GPU资源管理设计.md) | ✅ 有效 | GPU 纳管 + 调度 |
| 09 | [资源调度设计](tech-design/09-资源调度设计.md) | ✅ 有效 | 统一资源调度 |
| 10 | [路由改进方案](tech-design/10-路由改进方案.md) | ✅ 有效 | 前端路由 |
| 11 | [K8s调度设计](tech-design/11-K8s调度设计.md) | ✅ 有效 | K8s 节点调度 |
| 12 | [发布流程改进](tech-design/12-发布流程改进.md) | ✅ 有效 | CI/CD 改进 |

### 评审记录
| 文档 | 关联 |
|------|------|
| [review-03-评测任务调度与分发技术方案评审](tech-design/review-03-评测任务调度与分发技术方案评审.md) | ← 编号 03 |
| [review-09-资源调度设计评审](tech-design/review-09-资源调度设计评审.md) | ← 编号 09 |

---

## 📐 规范文档

| 文档 | 说明 |
|------|------|
| [api-reference.md](api-reference.md) | API 接口文档（后端 Controller 注解生成） |
| [FRONTEND-RULES.md](FRONTEND-RULES.md) | 前端开发规范 |
| [test-report.md](test-report.md) | 测试报告 |

---

## 📋 文档管理规则

1. **新需求 → 先写/更新设计文档** → 确认 → 拆 issue → 开发
2. **评审意见** 单独放 `xxx-review.md`，正文吸收后标注版本
3. **版本演进** 保留历史版本（v1/v2/v3），README 标注哪个是最新
4. **技术设计** 按编号排序，方便追溯
5. **产品设计** 按模块分类，一个功能域一个文档
