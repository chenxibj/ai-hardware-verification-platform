# 评测报告对比功能设计文档

> **版本：** v1.1  
> **日期：** 2026-04-15  
> **作者：** 菜菜子（产品经理 + 架构）  
> **背景：** 从单个报告中移除评分/对比后，需要一个独立的报告对比功能承载 vs 百分比、雷达图等比较分析能力。
>
> **变更记录：**
> | 版本 | 日期 | 变更说明 |
> |------|------|---------|
> | v1.0 | 2026-04-15 | 初版 |
> | v1.1 | 2026-04-15 | 采纳 chenxi 6条评审建议：①统一指标方向性公式 ②扩展性/生态维度改用真实评测数据 ③前后端双计算+单测一致性 ④增加对比前提校验 ⑤PDF导出提前到P0 ⑥增加快速对比入口 |

---

## 一、产品定位

**核心价值：** 让用户选择 2-5 份评测报告，并排对比芯片性能差异，辅助采购决策和性能优化。

**与单个报告的分工：**

| | 单个报告 | 报告对比 |
|---|---|---|
| 展示数据 | 原始测试指标（延迟、吞吐、P95/P99、通过率） | vs 百分比、差值、趋势 |
| 可视化 | 柱状图、表格 | 八维雷达图叠加、差异热力图 |
| 评价体系 | 无评分，只展示事实 | 以基准报告为 100%，其他报告算百分比 |
| 适用场景 | 查看单次评测结果 | 芯片选型、版本迭代跟踪、竞品分析 |

---

## 二、用户故事

### US-1：芯片选型对比
**角色：** 算力采购决策者  
**场景：** 有 3 颗候选芯片都跑完了同一套评测模板，需要横向对比选型  
**操作：** 报告列表多选 → 点击 [对比] → 查看对比结果 → 导出 PDF 给领导

### US-2：版本迭代跟踪
**角色：** 芯片厂商研发工程师  
**场景：** 同一颗芯片不同版本（驱动/固件升级前后），对比性能变化  
**操作：** 选同芯片的两份报告 → 查看各指标变化趋势 → 定位退化项

### US-3：基准对标
**角色：** 评测工程师  
**场景：** 把国产芯片和 L40S 基准对标，生成达标率报告  
**操作：** 选基准报告 + 被测报告 → 自动计算 vs 基准百分比 → 导出

### US-4：L40S 快速对标（★ v1.1 新增）
**角色：** 评测工程师  
**场景：** 查看某芯片详情时，想快速知道它和 L40S 的差距  
**操作：** 芯片详情页 → [⚡ 与 L40S 快速对比] → 自动选择双方最新报告 → 进入对比页

---

## 三、入口与流程

### 3.1 入口（4 个，★ v1.1 新增第 4 个）

1. **报告列表页** — 勾选 2-5 份报告 → 顶部出现 [📊 对比分析] 按钮
2. **单个报告详情页** — 右上角 [与其他报告对比] → 弹出报告选择器
3. **芯片详情页** — 该芯片的历史报告列表中多选 → [版本对比]
4. **★ 芯片详情页快速对比** — [⚡ 与 L40S 快速对比] 一键按钮（需系统中存在 L40S 基准芯片和至少一份报告）

### 3.2 报告选择器

```
┌─────────────────────────────────────────────┐
│  选择对比报告                          [确定] │
├─────────────────────────────────────────────┤
│  🔍 搜索芯片/报告编号                        │
│                                             │
│  ☑ RPT-20260415-001  NVIDIA L40S    04-15   │
│  ☑ RPT-20260410-003  华为 Ascend 910B  04-10│
│  ☐ RPT-20260408-007  寒武纪 MLU370   04-08  │
│                                             │
│  ★ 基准报告: [RPT-20260415-001 ▼]           │
│  (其他报告的百分比将以此为基准计算)           │
└─────────────────────────────────────────────┘
```

**关键设计：** 用户必须选择一份 **基准报告**（默认选第一份，可切换）。其他报告的百分比以基准为 100% 计算。

### 3.3 对比前提校验（★ v1.1 新增）

进入对比页面前，系统自动检查报告兼容性：

| 检查项 | 条件 | 处理 |
|--------|------|------|
| 评测模板匹配 | 两份报告使用了相同评测模板 | 通过 |
| 算子重叠率 ≥ 50% | 两份报告的共同算子占比 ≥ 50% | 通过 |
| 算子重叠率 < 50% | 共同算子占比 < 50% | ⚠️ 弹 Warning：「两份报告的评测内容差异较大（仅 {N}% 算子重叠），对比结果可能不完整。是否继续？」 |
| 相同算子不同配置 | 同名算子但 batch size / dtype 不同 | ⚠️ 提示：「部分算子配置不同（如 MLP batch=4 vs batch=8），对比基于同名匹配，请注意配置差异」 |
| 报告数量 < 2 | 选择不足 2 份 | 🔴 阻断：「请至少选择 2 份报告进行对比」 |
| 报告数量 > 5 | 选择超过 5 份 | 🔴 阻断：「最多支持 5 份报告同时对比」 |

**算子匹配规则：** 按 `testItem` 精确匹配。`MLP-Medium/batch=4` 和 `MLP-Medium/batch=8` 视为不同算子。

---

## 四、对比页面布局

### 4.1 整体结构

```
┌─────────────────────────────────────────────────┐
│ [←返回]  📊 报告对比分析（3份）      [📥 导出PDF] │
│ 基准: RPT-xx (L40S) [切换▼]                      │
│ 对比: RPT-yy (910B), RPT-zz (MLU370)            │
│                                                   │
│ ⚠️ 模板兼容性提示（如有）                         │
├───────────────────────────────────────────────────┤
│                                                   │
│  Section 1: 总览卡片（并排）                       │
│  Section 2: 维度雷达图 + 维度对比表                │
│  Section 3: 算子级性能对比                         │
│  Section 4: 训练性能对比                           │
│  Section 5: 推理性能对比                           │
│  Section 6: 关键差异摘要                           │
│                                                   │
└───────────────────────────────────────────────────┘
```

### 4.2 Section 1：总览卡片

每份报告一张卡片并排，展示**原始统计值**（不含百分比，百分比在后面的维度表中）：

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 🔵 L40S       │  │ 🔴 Ascend 910B│  │ 🟢 MLU370    │
│ ★ 基准        │  │              │  │              │
│               │  │              │  │              │
│ 有效算子: 13  │  │ 有效算子: 15  │  │ 有效算子: 12  │
│ 通过率: 76.5% │  │ 通过率: 88.2% │  │ 通过率: 70.6% │
│ 最佳延迟:     │  │ 最佳延迟:     │  │ 最佳延迟:     │
│   0.004ms     │  │   0.003ms     │  │   0.006ms     │
│ 最高吞吐:     │  │ 最高吞吐:     │  │ 最高吞吐:     │
│   29435 ops/s │  │   35120 ops/s │  │   24800 ops/s │
│ 共同算子: —   │  │ 共同算子: 11  │  │ 共同算子: 10  │
│               │  │              │  │              │
│ RPT-xx 04-15  │  │ RPT-yy 04-10  │  │ RPT-zz 04-08  │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 4.3 Section 2：维度雷达图 + 维度对比表

**左侧：维度雷达图叠加**（详见第六章规格）

**右侧：维度对比表**

| 维度 | 计算公式 | L40S (基准) | Ascend 910B | MLU370 |
|------|---------|:-----------:|:-----------:|:------:|
| 计算 | 延迟倒比 | 100% | **115.2%** 🏆 | 82.3% |
| 访存 | 延迟倒比 | 100% | 95.6% | **103.1%** 🏆 |
| 通信 | 带宽正比 | 100% | 88.4% | 76.5% |
| 算子兼容 | 延迟倒比 | 100% | 92.1% | 89.7% |
| 训练 | 吞吐正比 | 100% | — | — |
| 推理 | 延迟倒比 | 100% | 91.3% | 85.6% |
| 扩展性 | 扩展效率正比 | 100% | 78.9% | — |
| 生态 | 通过率正比 | 100% | 71.4% | 57.1% |

> **"计算公式"列** 明确标注每个维度用的是哪种对比方向，消除歧义。

### 4.4 Section 3：算子级性能对比

**表格：** 每行一个算子（仅展示共同算子），展示多项原始指标 + vs 百分比

| 算子 | 维度 | 指标类型 | L40S | 910B | **vs 基准** | MLU370 | **vs 基准** |
|------|------|---------|:----:|:----:|:-----------:|:------:|:-----------:|
| MatMul | 计算 | 延迟(ms) | 0.022 | 0.019 | **115.8%** | 0.028 | 78.6% |
| MatMul | 计算 | 吞吐(ops/s) | 23027 | 26316 | **114.3%** | 17857 | 77.6% |
| Conv2D | 计算 | 延迟(ms) | 0.018 | 0.016 | **112.5%** | 0.022 | 81.8% |
| Softmax | 算子兼容 | 延迟(ms) | 0.013 | 0.014 | 92.9% | 0.015 | 86.7% |

> 同一算子展示延迟和吞吐两行，百分比各自用对应公式计算。

**排序/筛选：**
- 默认按 vs 基准百分比差异最大排序
- 可按维度筛选
- 可按"优于基准/劣于基准"筛选

### 4.5 Section 4 & 5：训练/推理性能对比

与 Section 3 格式一致，但按训练/推理维度独立分组展示。

### 4.6 Section 6：关键差异摘要

自动生成的文字总结（规则引擎）：

```
📊 对比摘要（基准：NVIDIA L40S，RPT-20260415-001）

📐 对比条件：共同算子 11/17 项（64.7%），使用同一评测模板

🏆 Ascend 910B 的优势维度：计算（115.2%）
⚠️ Ascend 910B 的劣势维度：扩展性（78.9%）、生态（71.4%）
📈 差异最大算子：MatMul（910B 延迟快 15.8%，吞吐高 14.3%）

💡 结论：
- Ascend 910B 在计算密集型场景有优势，但多卡扩展和生态支持不足
- MLU370 各维度表现均低于基准，但访存性能接近（103.1%）
```

---

## 五、指标计算体系（★ v1.1 重大重写）

> **核心原则：所有百分比的语义统一为「越大越好」。>100% 表示被测芯片优于基准，<100% 表示劣于基准。**
>
> 不同类型的指标，方向性不同，必须使用对应的公式。一刀切用延迟比是错的。

### 5.1 指标分类与公式

每个原始指标都有明确的「方向性」：

| 指标类型 | 方向 | 含义 | vs 公式 | 示例 |
|---------|------|------|---------|------|
| **延迟类** | ↓ 越小越好 | latencyMean, latencyP95, latencyP99 | `baseline / test × 100%` | 基准 0.022ms, 被测 0.019ms → 115.8%（被测更快） |
| **吞吐类** | ↑ 越大越好 | throughput (ops/s), Tokens/s, QPS | `test / baseline × 100%` | 基准 23027, 被测 26316 → 114.3%（被测更高） |
| **带宽类** | ↑ 越大越好 | busBandwidth (GB/s), memBandwidth | `test / baseline × 100%` | 基准 800 GB/s, 被测 720 → 90%（被测更低） |
| **效率类** | ↑ 越大越好 | GFLOPS 利用率, 扩展效率, 通过率 | `test / baseline × 100%` | 基准 85%, 被测 72% → 84.7% |
| **波动类** | ↓ 越小越好 | latencyCV, P95/P50 ratio | `baseline / test × 100%` | 基准 1.2, 被测 1.5 → 80%（被测波动更大） |

**统一语义：** vs% > 100% = 被测更好，vs% < 100% = 被测更差，vs% = 100% = 相同。

### 5.2 算子级百分比

每个算子根据其原始指标分别计算：

```python
def calc_vs_pct(metric_type, baseline_value, test_value):
    """统一的 vs 百分比计算函数"""
    if baseline_value <= 0 or test_value <= 0:
        return None  # 无效数据
    
    if metric_type in ("latency", "volatility"):  # ↓ 越小越好
        return (baseline_value / test_value) * 100.0
    else:  # throughput, bandwidth, efficiency → ↑ 越大越好
        return (test_value / baseline_value) * 100.0
```

**算子级对比输出：**

```json
{
  "testItem": "MatMul",
  "dimension": "compute",
  "metrics": {
    "latencyMean": {
      "baseline": 0.022, "test": 0.019,
      "vsPct": 115.8, "direction": "lower_better",
      "formula": "baseline / test × 100%"
    },
    "throughput": {
      "baseline": 23027.3, "test": 26315.8,
      "vsPct": 114.3, "direction": "higher_better",
      "formula": "test / baseline × 100%"
    }
  }
}
```

> **每个百分比旁边都标注使用的公式方向**，对外开放，可追溯可验证。

### 5.3 维度级百分比

每个维度的百分比 = 该维度下所有算子的 **主指标** vs 百分比的算术平均值。

**主指标定义：**

| 维度 | dimKey | 主指标 | 方向 | 说明 |
|------|--------|--------|------|------|
| 计算 | compute | latencyMean | ↓ | 核心算子计算延迟 |
| 访存 | memory | latencyMean | ↓ | 数据搬运延迟 |
| 通信 | communication | busBandwidth | ↑ | NCCL 总线带宽（★ 不是延迟！） |
| 算子兼容 | op_compat | latencyMean | ↓ | 激活/归一化算子延迟 |
| 训练 | training | throughput (Samples/s) | ↑ | 训练吞吐（★ 不是延迟！） |
| 推理 | inference | latencyMean | ↓ | 推理延迟 |
| 扩展性 | scalability | scalingEfficiency | ↑ | 多卡扩展效率（★ v1.1 改用评测数据） |
| 生态 | ecosystem | passRate × frameworkCoverage | ↑ | 算子通过率 × 框架覆盖率（★ v1.1 改用评测数据） |

```python
def calc_dimension_vs_pct(dimension, baseline_ops, test_ops):
    """计算某维度的 vs 百分比"""
    common_ops = set(baseline_ops.keys()) & set(test_ops.keys())
    if not common_ops:
        return None  # 该维度无共同算子 → 显示 "—"
    
    primary_metric = DIMENSION_PRIMARY_METRIC[dimension]
    metric_direction = METRIC_DIRECTION[primary_metric]
    
    vs_pcts = []
    for op in common_ops:
        bl_val = baseline_ops[op].get(primary_metric)
        ts_val = test_ops[op].get(primary_metric)
        pct = calc_vs_pct(metric_direction, bl_val, ts_val)
        if pct is not None:
            vs_pcts.append(pct)
    
    return mean(vs_pcts) if vs_pcts else None
```

### 5.4 综合百分比

```python
overall_vs_pct = mean([dim_pct for dim_pct in dimension_vs_pcts.values() if dim_pct is not None])
```

**仅计算有数据的维度的平均值。** 无数据维度不参与计算，不会拉低/拉高均值。

### 5.5 扩展性维度计算（★ v1.1 重新定义）

> **v1.0 问题：** 基于芯片 interconnect 带宽等静态规格参数，不是评测结果。  
> **v1.1 改为：** 基于实际多卡 NCCL/通信测试的扩展效率。

**数据来源：** 评测中如果包含 AllReduce / AllGather 等通信算子，且在不同卡数下有测试结果：

```
scalingEfficiency = throughput_N_cards / (throughput_1_card × N)
```

- 单卡吞吐和 N 卡吞吐都来自评测结果
- 如果评测中没有多卡测试数据 → **该维度显示 "—"**，不硬凑

**无数据时的处理：**
```
如果报告中无多卡通信测试结果:
    scalability = None  # 雷达图该轴收缩到 0，标注"无数据"
```

### 5.6 生态维度计算（★ v1.1 重新定义）

> **v1.0 问题：** 基于 supportedPrecisions 数量比值，是静态规格。  
> **v1.1 改为：** 基于实际评测中的算子通过率 × 框架覆盖率。

```python
def calc_ecosystem_score(report):
    """生态维度评分 = 算子通过率 × 框架覆盖率"""
    operators = report.operator_ranking
    valid_ops = [op for op in operators if op.dataStatus == "VALID"]
    passed_ops = [op for op in valid_ops if op.passed]
    
    # 算子通过率：有效算子中通过基准的比例
    pass_rate = len(passed_ops) / len(valid_ops) if valid_ops else 0
    
    # 框架覆盖率：评测涉及的维度数 / 总维度数（8维）
    covered_dims = set(op.dimension for op in valid_ops)
    framework_coverage = len(covered_dims) / 8
    
    return pass_rate * framework_coverage * 100  # 归一化到 0-100
```

**对比时：**
```
ecosystem_vs_pct = test_ecosystem_score / baseline_ecosystem_score × 100%
```

如果某份报告的算子通过率为 0 或无有效算子 → 该维度显示 "—"。

### 5.7 边界处理（完整）

| 场景 | 处理 | 显示 |
|------|------|------|
| 基准报告某算子缺失 | 该算子不参与对比 | 不展示该行 |
| 被测报告某算子缺失 | 该算子无法计算百分比 | 显示 "—" |
| 某维度所有共同算子缺失 | 无法计算维度百分比 | 显示 "—"，雷达图该轴缩到 0 |
| 延迟/吞吐为 0 或负数 | 视为无效数据 | 跳过，不参与计算 |
| 百分比 > 200% | 雷达图裁剪到 200% | 表格显示真实值，tooltip 显示原始数据 |
| 基准就是被测（同一报告） | 所有百分比 = 100% | 正常显示 100% |

### 5.8 公式开放性

**所有百分比数值旁边，hover 时显示 tooltip 包含：**
- 基准原始值
- 被测原始值
- 使用的公式（如 "baseline_latency / test_latency × 100%"）
- 指标方向（↓ 延迟越低越好 / ↑ 吞吐越高越好）

**API 响应中，每个百分比字段都附带 formula 和 direction：**
```json
{
  "vsPct": 115.8,
  "formula": "baseline_latency / test_latency",
  "direction": "lower_better",
  "baselineValue": 0.022,
  "testValue": 0.019
}
```

---

## 六、维度雷达图规格

### 6.1 维度定义（★ v1.1 更新扩展性和生态的数据来源）

| dimKey | 中文名 | 数据来源 | 主指标方向 |
|--------|--------|---------|-----------|
| compute | 计算 | MatMul, Conv2D, GEMM, Linear 算子评测结果 | ↓ 延迟 |
| memory | 访存 | Transpose, Embedding, Concat, Gather 算子评测结果 | ↓ 延迟 |
| communication | 通信 | AllReduce, AllGather, NCCL, P2P 通信评测结果 | ↑ 带宽 |
| op_compat | 算子兼容 | ReLU, GELU, SiLU, Softmax, LayerNorm, BatchNorm 算子评测结果 | ↓ 延迟 |
| training | 训练 | Backward, Gradient, Optimizer, MixedPrecision 训练评测结果 | ↑ 吞吐 |
| inference | 推理 | Attention, ScaledDotProduct, MLP, BERT, LLaMA 推理评测结果 | ↓ 延迟 |
| scalability | 扩展性 | 多卡通信测试的扩展效率（8卡/单卡比值）。**无多卡测试 → 显示 "—"** | ↑ 效率 |
| ecosystem | 生态 | 算子通过率 × 框架覆盖率（来自评测结果）。**无有效算子 → 显示 "—"** | ↑ 效率 |

### 6.2 渲染规格

- **大小：** 400×400px（响应式缩放）
- **网格层数：** 5 层（40%, 60%, 80%, 100%, 120%+）
- **★ 基准线：** 100% 处绘制加粗虚线八边形（蓝灰色 #bfbfbf, strokeDash: 4,4）
- **数据层：** 每份报告一个多边形，fillOpacity=0.12 + strokeWidth=2
- **颜色：** 蓝 #1890ff / 红 #f5222d / 绿 #52c41a / 橙 #fa8c16 / 紫 #722ed1
- **交互：** hover 显示 tooltip：「计算: 115.2%（延迟 0.019ms vs 基准 0.022ms）」
- **轴标签：** 维度名 + 百分比值（如 "计算 115.2%"）
- **无数据轴：** 灰色虚线标注 "—"，多边形在该轴收缩到 0

### 6.3 特殊处理

- 维度无数据 → 该轴收缩到中心，旁边灰色标注 "无数据"
- 百分比 > 200% → 雷达图裁剪到网格最外圈，标签显示实际值（如 "计算 325.0%"）
- 只有 1 份报告 → 不显示雷达图，提示"请选择 2 份以上报告"
- 基准报告的多边形用虚线描边（与被测的实线区分）

---

## 七、计算架构（★ v1.1 重写）

> **核心决策：后端为主，前端为辅，公式必须一致。**

### 7.1 计算职责分工

| 场景 | 计算方 | 原因 |
|------|--------|------|
| 首次加载对比页 | **后端** | 保证准确性，统一算子→维度映射 |
| 切换基准报告 | **前端** | 用已拉取的原始数据重算，保证流畅体验 |
| 导出 PDF | **后端** | PDF 渲染在服务端，需要后端算好数据 |

### 7.2 共享公式库

为保证前后端计算结果一致，**核心公式抽取为独立模块，加单测覆盖：**

**后端：** `ComparisonService.java`
```java
public class ComparisonService {
    
    /**
     * 统一的 vs 百分比计算
     * @param direction "lower_better" (延迟/波动) 或 "higher_better" (吞吐/带宽/效率)
     */
    public static Double calcVsPct(String direction, double baselineValue, double testValue) {
        if (baselineValue <= 0 || testValue <= 0) return null;
        if ("lower_better".equals(direction)) {
            return (baselineValue / testValue) * 100.0;
        } else {
            return (testValue / baselineValue) * 100.0;
        }
    }
}
```

**前端：** `utils/comparison.js`
```javascript
/**
 * 统一的 vs 百分比计算 — 与后端 ComparisonService.calcVsPct 保持一致
 * @param {"lower_better"|"higher_better"} direction
 */
export function calcVsPct(direction, baselineValue, testValue) {
    if (baselineValue <= 0 || testValue <= 0) return null;
    if (direction === "lower_better") {
        return (baselineValue / testValue) * 100.0;
    } else {
        return (testValue / baselineValue) * 100.0;
    }
}
```

**一致性单测：**

| 测试用例 | baseline | test | direction | 期望结果 |
|---------|----------|------|-----------|---------|
| 延迟-被测更快 | 0.022 | 0.019 | lower_better | 115.79% |
| 延迟-被测更慢 | 0.022 | 0.028 | lower_better | 78.57% |
| 延迟-相同 | 0.022 | 0.022 | lower_better | 100.00% |
| 吞吐-被测更高 | 23027 | 26316 | higher_better | 114.28% |
| 吞吐-被测更低 | 23027 | 17857 | higher_better | 77.55% |
| 吞吐-相同 | 23027 | 23027 | higher_better | 100.00% |
| 基准值为 0 | 0 | 0.019 | lower_better | null |
| 被测值为 0 | 0.022 | 0 | lower_better | null |
| 负值 | -1 | 0.019 | lower_better | null |

> **后端和前端各自跑一遍上述测试用例，结果必须完全一致。**

### 7.3 对比 API（升级）

```
GET /api/chip-reports/compare?ids=90,91,92&baselineId=90
```

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ids | string | ✅ | 报告 ID 列表，逗号分隔，2-5 个 |
| baselineId | long | 可选 | 基准报告 ID。默认取 ids 中的第一个 |

**响应体：**

```json
{
  "code": 0,
  "data": {
    "meta": {
      "baselineId": 90,
      "reportCount": 3,
      "commonOperators": 11,
      "totalOperators": 17,
      "overlapRate": 64.7,
      "templateMatch": true,
      "warnings": ["部分算子配置不同（MLP batch=4 vs batch=8）"]
    },
    "baseline": {
      "id": 90,
      "reportNo": "RPT-20260415-001",
      "chipName": "NVIDIA L40S",
      "chipId": 952
    },
    "reports": [
      {
        "id": 91,
        "reportNo": "RPT-20260412-003",
        "chipName": "Ascend 910B",
        "chipId": 960,
        "operatorCount": 15,
        "passRate": 88.2,
        "overallVsPct": 95.6,
        "operators": [
          {
            "testItem": "MatMul",
            "dimension": "compute",
            "metrics": {
              "latencyMean": {
                "value": 0.019,
                "baselineValue": 0.022,
                "vsPct": 115.8,
                "direction": "lower_better",
                "formula": "baseline / test × 100%"
              },
              "throughput": {
                "value": 26315.8,
                "baselineValue": 23027.3,
                "vsPct": 114.3,
                "direction": "higher_better",
                "formula": "test / baseline × 100%"
              }
            }
          }
        ]
      }
    ],
    "dimensions": {
      "compute": {
        "primaryMetric": "latencyMean",
        "direction": "lower_better",
        "formula": "avg(baseline_latency / test_latency) × 100%",
        "reports": {
          "91": { "vsPct": 115.2, "operatorCount": 3 },
          "92": { "vsPct": 82.3, "operatorCount": 2 }
        }
      },
      "scalability": {
        "primaryMetric": "scalingEfficiency",
        "direction": "higher_better",
        "formula": "test_efficiency / baseline_efficiency × 100%",
        "reports": {
          "91": { "vsPct": 78.9, "operatorCount": 1 },
          "92": null
        }
      }
    },
    "summary": {
      "91": {
        "overallVsPct": 95.6,
        "strongDimensions": [{"dim": "compute", "vsPct": 115.2}],
        "weakDimensions": [{"dim": "scalability", "vsPct": 78.9}, {"dim": "ecosystem", "vsPct": 71.4}],
        "biggestGap": {"testItem": "MatMul", "metric": "latencyMean", "vsPct": 115.8}
      }
    }
  }
}
```

---

## 八、前端页面改造

### 8.1 文件改动

| 文件 | 改动 |
|------|------|
| `ReportCompare.js` | 重写，对接新 API，实现 6 个 Section |
| `OverlayRadarChart.js` | 升级八维 + 100% 基准线 + hover tooltip |
| `utils/comparison.js` | ★ 新增，共享 vs 百分比计算函数 |
| `ReportList.js` | 多选 + [对比分析] 按钮 |
| `ChipReport.js` | 右上角 [与其他报告对比] 入口 |
| `ChipProfile.js` | ★ [⚡ 与 L40S 快速对比] 按钮 |
| `routes.js` | 路由不变（`/reports/compare?ids=x,y`） |

---

## 九、交互细节

### 9.1 报告选择

- 报告列表 checkbox 多选，选 2 份以上时顶部出现蓝色操作栏
- 操作栏内容：`已选 3 份报告  [📊 对比分析] [✕ 取消]`
- 点击 → 前端先执行对比前提校验（3.3 节） → 通过后跳转 `/reports/compare?ids=90,91,92`
- 最多选 5 份

### 9.2 基准切换

- 对比页顶部有 [切换基准 ▼] 下拉
- 切换后，前端用已加载的原始数据 + `utils/comparison.js` 重算所有百分比
- **不重新请求后端 API**（数据已有，只是基准变了）
- 重算逻辑和后端用同一个 `calcVsPct` 函数

### 9.3 快速对比（★ v1.1 新增）

芯片详情页 `ChipProfile.js`：

```jsx
{hasL40SReport && hasThisChipReport && (
  <Button type="primary" ghost icon={<ThunderboltOutlined />}
    onClick={() => navigate(`/reports/compare?ids=${thisChipLatestReportId},${l40sLatestReportId}&baselineId=${l40sLatestReportId}`)}>
    ⚡ 与 L40S 快速对比
  </Button>
)}
```

**条件：** 系统中存在 CHIP-BASELINE-L40S 芯片且有报告 + 当前芯片也有报告。否则按钮不显示。

### 9.4 导出 PDF（★ v1.1 提前到 P0）

P0 实现基础版 PDF 导出：
- 内容：对比表格（维度对比 + 算子对比） + 差异摘要文字
- 不含雷达图（SVG→PNG 转换放 P1 美化版）
- 使用已有的 `exportToPdf` 工具

---

## 十、实现优先级（★ v1.1 调整）

### P0（第一期）

- [x] 报告列表多选 + [对比] 入口
- [ ] 后端 ComparisonService + 对比 API 升级
- [ ] 前端 utils/comparison.js（共享公式库）
- [ ] 一致性单测（前后端同跑 5.2 节的测试用例表）
- [ ] 对比前提校验（模板匹配 + 算子重叠率）
- [ ] 维度雷达图（八维 + 100% 基准线）
- [ ] 维度对比表 + 算子对比表
- [ ] 关键差异摘要
- [ ] ★ 基础版 PDF 导出（表格 + 文字）
- [ ] ★ 芯片详情页 [⚡ 与 L40S 快速对比]

### P1（第二期）

- [ ] 美化版 PDF 导出（含雷达图 SVG→PNG）
- [ ] 训练/推理分开对比视图
- [ ] 分组柱状图可视化
- [ ] 差异热力图（算子 × 报告矩阵）

### P2（第三期）

- [ ] 版本趋势图（同芯片多报告折线）
- [ ] 对比结果缓存
- [ ] 对比分享（生成链接）

---

## 十一、数据依赖

对比功能基于**报告中的原始算子数据**实时计算，不依赖报告中预存的评分：

| 数据来源 | 字段 | 用途 |
|---------|------|------|
| `chip_reports.operator_ranking` (JSON) | testItem, dimension, latencyMean, throughput, passed, dataStatus | 算子级对比 + 维度聚合 |
| `chips` 表 | name, chipNo | 芯片名称展示 |
| `evaluation_plans` 表 | templateId | 模板匹配校验 |

> **不使用** `dimension_scores`、`radar_data`、`overall_score` 等预存评分字段。所有百分比基于原始 operator 数据实时算。
