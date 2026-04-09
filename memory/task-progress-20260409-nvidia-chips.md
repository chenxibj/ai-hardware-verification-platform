# Task: 预置 NVIDIA 芯片规格

## 状态: ✅ 完成

## 完成的芯片列表

| ID | 名称 | 架构 | 代次 | FP32 (GFLOPS) | FP16 (GFLOPS) | 带宽 (GB/s) | 显存 |
|-----|------|------|------|------|------|------|------|
| 745 | NVIDIA H100 SXM | Hopper (CUDA) | Hopper | 67,000 | 1,979,000 | 3,350 | 80GB HBM3 |
| 746 | NVIDIA H200 | Hopper (CUDA) | Hopper | 67,000 | 1,979,000 | 4,800 | 141GB HBM3e |
| 747 | NVIDIA A100 80GB | Ampere (CUDA) | Ampere | 19,500 | 312,000 | 2,039 | 80GB HBM2e |
| 748 | NVIDIA A10 | Ampere (CUDA) | Ampere | 31,200 | 62,500 | 600 | 24GB GDDR6 |
| 749 | NVIDIA L4 | Ada Lovelace (CUDA) | Ada Lovelace | 30,300 | 121,000 | 300 | 24GB GDDR6 |
| 750 | NVIDIA B200 | Blackwell (CUDA) | Blackwell | 90,000 | 4,500,000 | 8,000 | 192GB HBM3e |
| 751 | NVIDIA B100 | Blackwell (CUDA) | Blackwell | 70,000 | 3,500,000 | 8,000 | 192GB HBM3e |

## 每条记录包含完整字段
- chip_no: CHIP-20260409-001 ~ 007
- status: REGISTERED (符合数据库 check 约束)
- tech_spec: 含 CUDA 核心数、显存容量/类型、TDP、制程、NVLink、Tensor 核心数等
- software_stack: 含 CUDA、cuDNN、TensorRT、支持框架
- tags: 中文标签数组
- peak_gflops_fp32/fp16, peak_bandwidth_gbps: 已填写数值

## 执行日志
- 01:07 开始，检查表结构
- 01:08 发现 status 有 check 约束，不允许 'ACTIVE'，改用 'REGISTERED'
- 01:09 7 条 INSERT 全部成功，验证通过

## 数据库总计
chips 表现有 9 条记录（2 原有 + 7 新增）
