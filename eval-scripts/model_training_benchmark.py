#!/usr/bin/env python3
"""
模型训练基准测试 v1.0 — CPU/GPU 自动选择
支持:
  - MLP-Small-Train: 简单 MLP 训练 10 epochs（合成数据）
  - ResNet-50-Finetune: ResNet-50 微调 5 epochs（合成数据）
根据 _chip_info.chipType 自动选设备。GPU 计时使用 torch.cuda.Event。
"""
import json, time, sys, os, platform, math
import numpy as np
from datetime import datetime

try:
    import psutil
    HAS_PSUTIL = True
except Exception:
    HAS_PSUTIL = False

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

try:
    import torchvision
    import torchvision.models as tv_models
    HAS_TORCHVISION = True
except ImportError:
    HAS_TORCHVISION = False

# ── 设备选择（重用 operator_benchmark 的逻辑）──
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from operator_benchmark import resolve_device, get_device_str, get_gpu_info
except ImportError:
    GPU_CHIP_KEYWORDS = ["nvidia", "l40s", "a100", "v100", "h100", "h200", "a800", "h800",
                         "rtx", "gtx", "geforce", "tesla", "quadro", "titan"]
    def resolve_device(chip_info):
        if not HAS_TORCH:
            return None
        chip_type = (chip_info.get("chipType") or "").upper()
        chip_name = (chip_info.get("chipName") or "").lower()
        want_gpu = chip_type == "GPU" or any(kw in chip_name for kw in GPU_CHIP_KEYWORDS)
        if want_gpu and torch.cuda.is_available():
            return torch.device("cuda")
        if want_gpu:
            print("[DEVICE] WARNING: GPU requested but CUDA unavailable, falling back to CPU", flush=True)
        return torch.device("cpu")
    def get_device_str(device):
        return str(device) if device is not None else "cpu"
    def get_gpu_info(device):
        info = {}
        if device is not None and HAS_TORCH and device.type == "cuda":
            info["gpu_name"] = torch.cuda.get_device_name(device)
            info["gpu_memory_allocated_mb"] = round(torch.cuda.memory_allocated(device) / 1048576, 2)
            info["gpu_memory_reserved_mb"] = round(torch.cuda.memory_reserved(device) / 1048576, 2)
        return info


def get_system_info():
    info = {
        "cpu": platform.processor() or platform.machine(),
        "arch": platform.machine(),
        "os": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
        "numpy": np.__version__,
    }
    if HAS_TORCH:
        info["torch"] = torch.__version__
        info["cuda_available"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            info["cuda_version"] = torch.version.cuda
    if HAS_TORCHVISION:
        info["torchvision"] = torchvision.__version__
    if HAS_PSUTIL:
        info["cores_physical"] = psutil.cpu_count(logical=False)
        info["cores_logical"] = psutil.cpu_count(logical=True)
        info["memory_gb"] = round(psutil.virtual_memory().total / 1e9, 1)
    return info


# ================================================================
# 计时工具
# ================================================================

class EpochTimer:
    """每 epoch 计时。GPU 使用 cuda events，CPU 使用 perf_counter。"""
    def __init__(self, is_gpu):
        self.is_gpu = is_gpu
        if is_gpu:
            self._start = torch.cuda.Event(enable_timing=True)
            self._end = torch.cuda.Event(enable_timing=True)

    def start(self):
        if self.is_gpu:
            torch.cuda.synchronize()
            self._start.record()
        else:
            self._t0 = time.perf_counter()

    def stop(self):
        if self.is_gpu:
            self._end.record()
            torch.cuda.synchronize()
            return self._start.elapsed_time(self._end) / 1000.0  # seconds
        else:
            return time.perf_counter() - self._t0  # seconds


# ================================================================
# 合成数据生成
# ================================================================

def make_synthetic_dataset(num_samples, input_dim, num_classes, device):
    """生成合成分类数据集"""
    X = torch.randn(num_samples, input_dim, device=device)
    y = torch.randint(0, num_classes, (num_samples,), device=device)
    return X, y


def make_synthetic_image_dataset(num_samples, num_classes, img_size=224, device="cpu"):
    """生成合成图像分类数据集 (NCHW)"""
    X = torch.randn(num_samples, 3, img_size, img_size, device=device)
    y = torch.randint(0, num_classes, (num_samples,), device=device)
    return X, y


# ================================================================
# 训练配置
# ================================================================

TRAINING_CONFIGS = {
    "MLP-Small-Train": {
        "desc": "小型 MLP 训练 (合成 MNIST-like 数据)",
        "input_dim": 784,
        "hidden_dim": 128,
        "output_dim": 10,
        "epochs": 10,
        "batch_size": 64,
        "lr": 0.01,
        "num_train_samples": 5000,
        "num_val_samples": 1000,
        "model_type": "mlp",
    },
    "ResNet-50-Finetune": {
        "desc": "ResNet-50 微调 (合成 ImageNet-like 数据)",
        "output_dim": 10,
        "epochs": 5,
        "batch_size": 16,
        "lr": 0.001,
        "num_train_samples": 500,
        "num_val_samples": 100,
        "img_size": 224,
        "model_type": "resnet50",
    },
}


# ================================================================
# 模型构建
# ================================================================

class SimpleMLP(nn.Module):
    def __init__(self, input_dim, hidden_dim, output_dim):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, output_dim),
        )

    def forward(self, x):
        return self.net(x)


def build_model(cfg, device):
    """根据配置构建模型"""
    model_type = cfg["model_type"]
    if model_type == "mlp":
        model = SimpleMLP(cfg["input_dim"], cfg["hidden_dim"], cfg["output_dim"])
    elif model_type == "resnet50":
        if not HAS_TORCHVISION:
            raise RuntimeError("ResNet-50 需要 torchvision，请安装: pip install torchvision")
        # 使用 weights=None 从头构建（不下载预训练权重，避免网络依赖）
        model = tv_models.resnet50(weights=None)
        # 替换最后的 FC 层
        model.fc = nn.Linear(model.fc.in_features, cfg["output_dim"])
    else:
        raise ValueError(f"未知模型类型: {model_type}")

    model = model.to(device)
    return model


# ================================================================
# 训练循环
# ================================================================

def train_one_epoch(model, X, y, criterion, optimizer, batch_size, device):
    """训练一个 epoch，返回平均 loss 和 samples/sec"""
    model.train()
    num_samples = X.shape[0]
    total_loss = 0.0
    num_batches = 0
    correct = 0

    # 简单的随机 batch 迭代
    indices = torch.randperm(num_samples, device=device)
    for start in range(0, num_samples, batch_size):
        end = min(start + batch_size, num_samples)
        idx = indices[start:end]
        xb = X[idx]
        yb = y[idx]

        optimizer.zero_grad()
        output = model(xb)
        loss = criterion(output, yb)
        loss.backward()
        optimizer.step()

        total_loss += loss.item()
        num_batches += 1
        correct += (output.argmax(dim=-1) == yb).sum().item()

    avg_loss = total_loss / max(num_batches, 1)
    accuracy = correct / num_samples
    return avg_loss, accuracy


def validate(model, X, y, criterion, batch_size, device):
    """验证集评估"""
    model.eval()
    num_samples = X.shape[0]
    total_loss = 0.0
    num_batches = 0
    correct = 0

    with torch.no_grad():
        for start in range(0, num_samples, batch_size):
            end = min(start + batch_size, num_samples)
            xb = X[start:end]
            yb = y[start:end]
            output = model(xb)
            loss = criterion(output, yb)
            total_loss += loss.item()
            num_batches += 1
            correct += (output.argmax(dim=-1) == yb).sum().item()

    avg_loss = total_loss / max(num_batches, 1)
    accuracy = correct / num_samples
    return avg_loss, accuracy


def run_training_benchmark(model_name, params_override, device):
    """运行单个训练 benchmark"""
    if model_name not in TRAINING_CONFIGS:
        raise ValueError(f"未知模型: {model_name}，可选: {list(TRAINING_CONFIGS.keys())}")

    if not HAS_TORCH:
        raise RuntimeError("训练 benchmark 需要 PyTorch，请安装: pip install torch")

    cfg = dict(TRAINING_CONFIGS[model_name])
    # 允许参数覆盖
    if params_override:
        for k in ("epochs", "batch_size", "lr", "num_train_samples", "num_val_samples"):
            if k in params_override:
                cfg[k] = params_override[k]

    is_gpu = device.type == "cuda"
    timer = EpochTimer(is_gpu)

    print(f"[TRAIN] 开始训练: {model_name} | device={get_device_str(device)} | "
          f"epochs={cfg['epochs']} | batch_size={cfg['batch_size']} | lr={cfg['lr']}", flush=True)

    # 构建模型
    model = build_model(cfg, device)
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"[TRAIN] 模型参数: total={total_params:,}, trainable={trainable_params:,}", flush=True)

    # 生成数据
    if cfg["model_type"] == "mlp":
        X_train, y_train = make_synthetic_dataset(
            cfg["num_train_samples"], cfg["input_dim"], cfg["output_dim"], device)
        X_val, y_val = make_synthetic_dataset(
            cfg["num_val_samples"], cfg["input_dim"], cfg["output_dim"], device)
    else:  # resnet50
        img_size = cfg.get("img_size", 224)
        X_train, y_train = make_synthetic_image_dataset(
            cfg["num_train_samples"], cfg["output_dim"], img_size, device)
        X_val, y_val = make_synthetic_image_dataset(
            cfg["num_val_samples"], cfg["output_dim"], img_size, device)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=cfg["lr"])

    # Warmup（GPU JIT 编译）
    if is_gpu:
        print("[TRAIN] GPU warmup (2 iterations)...", flush=True)
        model.train()
        for _ in range(2):
            xb = X_train[:cfg["batch_size"]]
            yb = y_train[:cfg["batch_size"]]
            optimizer.zero_grad()
            out = model(xb)
            loss = criterion(out, yb)
            loss.backward()
            optimizer.step()
        torch.cuda.synchronize()
        print("[TRAIN] GPU warmup 完成", flush=True)

    # 训练循环
    epoch_results = []
    loss_curve = []
    total_start = time.perf_counter()

    for epoch in range(cfg["epochs"]):
        timer.start()
        train_loss, train_acc = train_one_epoch(
            model, X_train, y_train, criterion, optimizer, cfg["batch_size"], device)
        epoch_time = timer.stop()

        # 验证
        val_loss, val_acc = validate(model, X_val, y_val, criterion, cfg["batch_size"], device)

        samples_per_sec = cfg["num_train_samples"] / epoch_time if epoch_time > 0 else 0

        epoch_result = {
            "epoch": epoch + 1,
            "train_loss": round(train_loss, 6),
            "train_accuracy": round(train_acc, 4),
            "val_loss": round(val_loss, 6),
            "val_accuracy": round(val_acc, 4),
            "epoch_time_sec": round(epoch_time, 3),
            "throughput_samples_per_sec": round(samples_per_sec, 1),
        }
        epoch_results.append(epoch_result)
        loss_curve.append(round(train_loss, 6))

        print(f"[TRAIN] Epoch {epoch+1}/{cfg['epochs']}: "
              f"train_loss={train_loss:.4f}, train_acc={train_acc:.4f}, "
              f"val_loss={val_loss:.4f}, val_acc={val_acc:.4f}, "
              f"time={epoch_time:.3f}s, throughput={samples_per_sec:.1f} samples/s", flush=True)

    total_time = time.perf_counter() - total_start

    # GPU 内存统计
    gpu_info = {}
    if is_gpu:
        gpu_info = get_gpu_info(device)
        gpu_info["gpu_peak_memory_mb"] = round(torch.cuda.max_memory_allocated(device) / 1048576, 2)

    # 计算汇总
    epoch_times = [e["epoch_time_sec"] for e in epoch_results]
    throughputs = [e["throughput_samples_per_sec"] for e in epoch_results]

    # Loss 是否下降（训练是否正常）
    first_loss = loss_curve[0] if loss_curve else 0
    last_loss = loss_curve[-1] if loss_curve else 0
    loss_decreased = last_loss < first_loss
    convergence_status = "CONVERGING" if loss_decreased else "NOT_CONVERGING"

    result = {
        "model": model_name,
        "description": cfg["desc"],
        "device": get_device_str(device),
        "config": {
            "epochs": cfg["epochs"],
            "batch_size": cfg["batch_size"],
            "learning_rate": cfg["lr"],
            "num_train_samples": cfg["num_train_samples"],
            "num_val_samples": cfg["num_val_samples"],
            "optimizer": "Adam",
            "criterion": "CrossEntropyLoss",
        },
        "model_info": {
            "total_params": total_params,
            "trainable_params": trainable_params,
            "model_type": cfg["model_type"],
        },
        "epochs": epoch_results,
        "loss_curve": loss_curve,
        "summary": {
            "total_training_time_sec": round(total_time, 3),
            "avg_epoch_time_sec": round(np.mean(epoch_times), 3),
            "min_epoch_time_sec": round(np.min(epoch_times), 3),
            "max_epoch_time_sec": round(np.max(epoch_times), 3),
            "avg_throughput_samples_per_sec": round(np.mean(throughputs), 1),
            "peak_throughput_samples_per_sec": round(np.max(throughputs), 1),
            "final_train_loss": last_loss,
            "final_val_loss": round(epoch_results[-1]["val_loss"], 6),
            "final_train_accuracy": round(epoch_results[-1]["train_accuracy"], 4),
            "final_val_accuracy": round(epoch_results[-1]["val_accuracy"], 4),
            "convergence_status": convergence_status,
        },
        "status": "PASS" if loss_decreased else "WARN",
    }

    if gpu_info:
        result.update(gpu_info)

    return result


# ================================================================
# Main
# ================================================================

def main():
    params = {}
    if len(sys.argv) > 1:
        try:
            params = json.loads(sys.argv[1])
        except Exception:
            pass

    # ── 设备选择 ──
    chip_info = params.get("_chip_info", {})
    device = resolve_device(chip_info)
    if device is None:
        print("[ERROR] 训练 benchmark 需要 PyTorch", flush=True, file=sys.stderr)
        sys.exit(1)

    # 可以指定单个模型或者 models 列表
    model_filter = params.get("model", params.get("models", None))
    if model_filter is None:
        model_filter = list(TRAINING_CONFIGS.keys())
    elif isinstance(model_filter, str):
        model_filter = [model_filter]

    # 参数覆盖
    overrides = {}
    for k in ("epochs", "batch_size", "lr", "num_train_samples", "num_val_samples"):
        if k in params:
            overrides[k] = params[k]

    print(f"[EVAL] === 训练基准测试开始 === device={get_device_str(device)}, "
          f"models={model_filter}", flush=True)

    results = []
    for model_name in model_filter:
        # 标准化模型名
        matched = None
        for key in TRAINING_CONFIGS:
            if key.lower() == model_name.lower() or key.lower().replace("-", "") == model_name.lower().replace("-", ""):
                matched = key
                break
        if matched is None:
            print(f"[WARN] 跳过未知模型: {model_name}，可选: {list(TRAINING_CONFIGS.keys())}", flush=True)
            continue

        try:
            r = run_training_benchmark(matched, overrides, device)
            results.append(r)
        except Exception as e:
            print(f"[ERROR] {model_name} 训练失败: {e}", flush=True)
            import traceback
            traceback.print_exc()
            results.append({
                "model": model_name, "status": "FAIL",
                "error": str(e), "device": get_device_str(device),
            })

    # 汇总
    passed = sum(1 for r in results if r.get("status") in ("PASS", "WARN"))
    failed = len(results) - passed

    avg_throughput = 0
    throughput_values = [r["summary"]["avg_throughput_samples_per_sec"]
                        for r in results if "summary" in r]
    if throughput_values:
        avg_throughput = np.mean(throughput_values)

    total_time_values = [r["summary"]["total_training_time_sec"]
                        for r in results if "summary" in r]
    total_time = sum(total_time_values) if total_time_values else 0

    output = {
        "benchmark_name": "model_training_benchmark",
        "benchmark_version": "1.0",
        "timestamp": datetime.now().isoformat(),
        "system_info": get_system_info(),
        "config": {
            "models": model_filter,
            "device": get_device_str(device),
            "overrides": overrides,
        },
        "results": results,
        "summary": {
            "total_models": len(results),
            "passed": passed,
            "failed": failed,
            "pass_rate": round(passed / max(len(results), 1) * 100, 1),
            "total_training_time_sec": round(total_time, 3),
            "avg_throughput_samples_per_sec": round(avg_throughput, 1),
            "device": get_device_str(device),
        },
        "conclusion": (
            f"共测试{len(results)}个训练模型，{passed}个通过。"
            f"总训练时间{total_time:.1f}s，平均吞吐{avg_throughput:.1f} samples/s。"
            f"设备: {get_device_str(device)}"
        ),
    }

    if device is not None and device.type == "cuda":
        output["gpu_info"] = get_gpu_info(device)

    print(f"[EVAL] === 训练测试完成 === {passed}/{len(results)} PASS, "
          f"device={get_device_str(device)}", flush=True)
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
