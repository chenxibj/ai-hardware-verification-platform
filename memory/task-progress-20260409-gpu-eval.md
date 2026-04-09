# GPU L40S 节点注册 + 评测进度

## 时间
- 开始: 2026-04-09 17:22 CST
- 完成: 2026-04-09 17:58 CST

## Step 1: 节点注册 ✅
- 节点名: gpu-l40s-01
- 节点 ID: 18
- IP: 180.184.249.205:12345 (SSH) / 127.0.0.1:8091 (Agent via tunnel)
- 硬件:
  - CPU: 128C Intel Xeon Gold 6448Y (2 sockets × 32 cores × 2 threads)
  - 内存: 503GB
  - 磁盘: 865GB SSD
  - GPU: 8× NVIDIA L40S (48GB GDDR6 each), Driver 570.148.08, CUDA 12.8
- 状态: ONLINE

## Step 2: Agent 部署 ✅
- Agent 代码从开发机复制到 GPU 节点 ✅
- config.yaml 配置完成 (platform URL: http://39.97.251.94:8080/api) ✅
- GPU 评测脚本创建 ✅:
  - `gpu_operator_benchmark.py` - PyTorch CUDA 版算子基准测试
  - `gpu_model_inference.py` - PyTorch CUDA 版模型推理测试
- executor.py SCRIPT_MAP 更新为 GPU 脚本 ✅
- PyTorch 2.11.0+cu128 安装完成 ✅
- Agent 启动成功 ✅ (PID 7782, 端口 8090)
- 注意: GPU 节点 8090 端口被云安全组限制，通过 SSH 反向隧道 (GPU:8090 -> Dev:8091) 解决

## Step 3: 评测执行 ✅
- Plan ID: 567 (PLAN-20260409-053)
- Plan 名称: NVIDIA L40S-GPU快速评测-20260409
- 模板: 芯片快速验证 (ID 95)
- 芯片: NVIDIA L40S (ID 450)
- 总任务: 17 (13 OPERATOR + 4 MODEL)
- 状态: **COMPLETED (100%)**

### 算子评测结果 (FP32, NVIDIA L40S)

| 算子 | 延迟(ms) | 吞吐(ops/s) | TFLOPS | 状态 |
|------|---------|------------|--------|------|
| MatMul (1024×1024) | 0.089 | 9,228 | 24.236 | ✅ PASS |
| Conv2D (8×3×224×224, k=3×3) | 0.417 | 2,279 | N/A | ✅ PASS |
| Softmax (64×1024) | 0.013 | 30,655 | N/A | ✅ PASS |
| ReLU (64×1024) | 0.013 | 30,185 | N/A | ✅ PASS |
| GELU (64×1024) | 0.013 | 30,520 | N/A | ✅ PASS |
| SiLU (64×1024) | 0.013 | 30,469 | N/A | ✅ PASS |
| LayerNorm (64×1024) | 0.023 | 22,640 | N/A | ✅ PASS |
| BatchNorm (64×1024) | 0.040 | 16,286 | N/A | ✅ PASS |
| Attention (2×8×256×64) | 0.061 | 12,260 | 4.382 | ✅ PASS |
| ScaledDotProduct (全套) | ~0.06 | ~12,300 | ~4.38 | ✅ PASS |
| Add (默认) | ~0.01 | ~31,000 | N/A | ✅ PASS |
| Mul (默认) | ~0.01 | ~31,000 | N/A | ✅ PASS |
| Transpose (1024×1024) | 0.022 | 23,799 | N/A | ✅ PASS |

### 模型推理结果 (MLP-Small, NVIDIA L40S)

| 模型 | Batch Size | 延迟(ms) | 吞吐(QPS) | 状态 |
|------|-----------|---------|----------|------|
| MLP-Small (784→128→10) | 1 | 0.053 | 14,073 | ✅ PASS |
| MLP-Small (784→128→10) | 4 | ~0.05 | ~14,500 | ✅ PASS |
| MLP-Small (784→128→10) | 8 | ~0.05 | ~14,600 | ✅ PASS |
| MLP-Small (784→128→10) | 16 | 0.050 | 14,627 | ✅ PASS |

### 关键发现
1. **MatMul TFLOPS**: 24.2 TFLOPS FP32，L40S 标称 91.6 TFLOPS FP32 → 26.4% 利用率（1024×1024 小矩阵限制）
2. **激活函数**: ReLU/GELU/SiLU/Softmax/Sigmoid 都极快 (~0.012-0.013ms)，GPU 计算优势明显
3. **Attention**: 4.38 TFLOPS，seq_len=256 下表现良好
4. **Conv2D**: 0.42ms for 224×224 输入，GPU 加速显著
5. **模型推理**: MLP-Small 在各 batch size 下吞吐稳定在 14K+ QPS

## 技术问题和解决
1. **PyTorch 安装**: Ubuntu 24.04 需要 `--break-system-packages` 和 `--force-reinstall --ignore-installed blinker`
2. **网络不通**: GPU 节点 8090 端口被安全组封锁 → SSH 反向隧道解决
3. **API 属性名**: `total_mem` → `total_memory` (PyTorch 2.11 API 变更)
4. **任务分发**: 平台 dispatcher 通过隧道不稳定 → 从 GPU 节点直接调用 agent 的 /execute API

## 平台状态
- 前端地址: http://39.97.251.94/
- Plan 567 可在 "评测管理" 页面查看完整报告
- 芯片 NVIDIA L40S (ID 450) 已有评测数据
