#!/usr/bin/env python3
"""
统一模型推理基准测试 v2.0 — 自动 CPU/GPU 设备选择
根据 _chip_info.chipType 判断芯片类型，自动选择 CPU/GPU。
GPU 计时使用 torch.cuda.Event。保持向后兼容。
"""
import json, time, sys, os, platform
import numpy as np
from datetime import datetime

try:
    import onnxruntime as ort
    HAS_ORT = True
except Exception:
    HAS_ORT = False

try:
    import psutil
    HAS_PSUTIL = True
except Exception:
    HAS_PSUTIL = False

try:
    import torch
    import torch.nn as nn
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

# ── 重用 operator_benchmark 的设备选择逻辑 ──
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from operator_benchmark import resolve_device, get_device_str, get_gpu_info, GPU_CHIP_KEYWORDS
except ImportError:
    # Fallback：内联最小实现
    GPU_CHIP_KEYWORDS = ["nvidia", "l40s", "a100", "v100", "h100", "h200", "a800", "h800",
                         "rtx", "gtx", "geforce", "tesla", "quadro", "titan"]
    def resolve_device(chip_info):
        if not HAS_TORCH:
            return None
        chip_type = (chip_info.get("chipType") or "").upper()
        chip_name = (chip_info.get("chipName") or "").lower()
        want_gpu = chip_type == "GPU" or any(kw in chip_name for kw in GPU_CHIP_KEYWORDS)
        if want_gpu:
            if torch.cuda.is_available():
                return torch.device("cuda")
            print("[DEVICE] WARNING: GPU requested but CUDA unavailable, falling back to CPU", flush=True)
        return torch.device("cpu") if HAS_TORCH else None
    def get_device_str(device):
        return str(device) if device is not None else "cpu(numpy)"
    def get_gpu_info(device):
        info = {}
        if device is not None and HAS_TORCH and device.type == "cuda":
            info["gpu_name"] = torch.cuda.get_device_name(device)
            info["gpu_memory_allocated_mb"] = round(torch.cuda.memory_allocated(device) / 1048576, 2)
            info["gpu_memory_reserved_mb"] = round(torch.cuda.memory_reserved(device) / 1048576, 2)
        return info


def setup_model_for_inference(model, chip_info, params):
    """根据可用 GPU 数量设置推理模型
    - 0 GPU (CPU): model.to("cpu")
    - 1 GPU: model.to("cuda:0")
    - N GPU: torch.nn.DataParallel(model)
    """
    gpu_count = params.get("_gpu_count", 0)
    device = resolve_device(chip_info)

    if device is None or device.type == "cpu":
        return model.to("cpu"), torch.device("cpu"), 1

    visible_gpus = torch.cuda.device_count()

    if visible_gpus <= 1:
        model = model.to(device)
        return model, device, 1

    # 多卡推理: DataParallel
    model = model.to("cuda:0")
    model = torch.nn.DataParallel(model)
    print(f"[MULTI-GPU] DataParallel inference on {visible_gpus} GPUs", flush=True)
    return model, torch.device("cuda:0"), visible_gpus


def get_system_info():
    info = {
        "cpu": platform.processor() or platform.machine(),
        "arch": platform.machine(),
        "os": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
        "numpy": np.__version__,
    }
    if HAS_ORT:
        info["onnxruntime"] = ort.__version__
    if HAS_TORCH:
        info["torch"] = torch.__version__
        info["cuda_available"] = torch.cuda.is_available()
    if HAS_PSUTIL:
        info["cores_physical"] = psutil.cpu_count(logical=False)
        info["cores_logical"] = psutil.cpu_count(logical=True)
        info["memory_gb"] = round(psutil.virtual_memory().total / 1e9, 1)
    return info


def create_onnx_model(path, in_sz, hid_sz, out_sz):
    try:
        import onnx
        from onnx import helper, TensorProto, numpy_helper
        W1 = numpy_helper.from_array(np.random.randn(in_sz, hid_sz).astype(np.float32) * 0.01, "W1")
        B1 = numpy_helper.from_array(np.zeros(hid_sz).astype(np.float32), "B1")
        W2 = numpy_helper.from_array(np.random.randn(hid_sz, out_sz).astype(np.float32) * 0.01, "W2")
        B2 = numpy_helper.from_array(np.zeros(out_sz).astype(np.float32), "B2")
        X = helper.make_tensor_value_info("X", TensorProto.FLOAT, [None, in_sz])
        Y = helper.make_tensor_value_info("Y", TensorProto.FLOAT, [None, out_sz])
        graph = helper.make_graph([
            helper.make_node("MatMul", ["X", "W1"], ["mm1"]),
            helper.make_node("Add", ["mm1", "B1"], ["h1"]),
            helper.make_node("Relu", ["h1"], ["h1r"]),
            helper.make_node("MatMul", ["h1r", "W2"], ["mm2"]),
            helper.make_node("Add", ["mm2", "B2"], ["lo"]),
            helper.make_node("Softmax", ["lo"], ["Y"], axis=1),
        ], "mlp", [X], [Y], [W1, B1, W2, B2])
        model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
        onnx.save(model, path)
        return True
    except Exception:
        return False


def numpy_mlp(x, W):
    h = np.maximum(x @ W["W1"] + W["B1"], 0)
    lo = h @ W["W2"] + W["B2"]
    e = np.exp(lo - np.max(lo, axis=-1, keepdims=True))
    return e / np.sum(e, axis=-1, keepdims=True)


# ── PyTorch MLP 模型 ──

class TorchMLP(nn.Module):
    def __init__(self, in_sz, hid_sz, out_sz):
        super().__init__()
        self.fc1 = nn.Linear(in_sz, hid_sz)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hid_sz, out_sz)

    def forward(self, x):
        h = self.relu(self.fc1(x))
        lo = self.fc2(h)
        return torch.softmax(lo, dim=-1)


# ── 计时工具 ──

def bench_cpu(run_fn, inp, warmup=10, iters=100):
    """CPU benchmark using time.perf_counter"""
    for _ in range(warmup):
        run_fn(inp)
    lats = []
    mem0 = psutil.virtual_memory().used / 1e6 if HAS_PSUTIL else 0
    cs = time.process_time()
    ws = time.perf_counter()
    for _ in range(iters):
        t0 = time.perf_counter()
        run_fn(inp)
        lats.append((time.perf_counter() - t0) * 1000)
    we = time.perf_counter() - ws
    ce = time.process_time() - cs
    mem1 = psutil.virtual_memory().used / 1e6 if HAS_PSUTIL else 0
    return _build_perf_result(lats, we, ce, mem1 - mem0)


def bench_gpu(run_fn, inp, warmup=10, iters=100):
    """GPU benchmark using torch.cuda.Event"""
    warmup = max(warmup, 10)
    for _ in range(warmup):
        run_fn(inp)

    start_event = torch.cuda.Event(enable_timing=True)
    end_event = torch.cuda.Event(enable_timing=True)

    lats = []
    ws = time.perf_counter()
    for _ in range(iters):
        torch.cuda.synchronize()
        start_event.record()
        run_fn(inp)
        end_event.record()
        torch.cuda.synchronize()
        lats.append(start_event.elapsed_time(end_event))
    we = time.perf_counter() - ws
    return _build_perf_result(lats, we, 0, 0)


def _build_perf_result(lats, wall_elapsed, cpu_elapsed, mem_delta):
    return {
        "latency_ms_mean": round(np.mean(lats), 3),
        "latency_ms_p50": round(np.percentile(lats, 50), 3),
        "latency_ms_p95": round(np.percentile(lats, 95), 3),
        "latency_ms_p99": round(np.percentile(lats, 99), 3),
        "latency_ms_min": round(np.min(lats), 3),
        "latency_ms_max": round(np.max(lats), 3),
        "throughput_qps": round(len(lats) / wall_elapsed, 1),
        "cpu_util_percent": round(cpu_elapsed / wall_elapsed * 100, 1) if wall_elapsed > 0 and cpu_elapsed > 0 else 0,
        "memory_delta_mb": round(mem_delta, 1),
        "total_time_sec": round(wall_elapsed, 3),
    }


ALL_CONFIGS = [
    {"name": "MLP-Small", "in": 784, "hid": 128, "out": 10, "desc": "小型MLP(MNIST分类)"},
    {"name": "MLP-Medium", "in": 784, "hid": 512, "out": 10, "desc": "中型MLP(MNIST分类)"},
    {"name": "MLP-Large", "in": 1024, "hid": 1024, "out": 100, "desc": "大型MLP(通用分类)"},
]


def main():
    params = {}
    if len(sys.argv) > 1:
        try:
            params = json.loads(sys.argv[1])
        except Exception:
            pass

    iterations = int(params.get("iterations", 100))
    batch_sizes = params.get("batch_sizes", params.get("batch_size", [1, 4, 16, 32]))
    if isinstance(batch_sizes, (int, float)):
        batch_sizes = [int(batch_sizes)]

    model_filter = params.get("model", params.get("models", None))
    if isinstance(model_filter, str):
        model_filter = [model_filter]

    # ── 设备选择 ──
    chip_info = params.get("_chip_info", {})
    device = resolve_device(chip_info)
    is_gpu = device is not None and device.type == "cuda"

    assets_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "models")
    os.makedirs(assets_dir, exist_ok=True)

    configs = ALL_CONFIGS
    if model_filter:
        filter_lower = [m.lower() for m in model_filter]
        configs = [c for c in configs if c["name"].lower() in filter_lower]
        if not configs:
            raise ValueError("没有匹配的模型，可用: " + ", ".join(c["name"] for c in ALL_CONFIGS))

    print(f"[EVAL] === 模型推理基准测试开始 === device={get_device_str(device)}, "
          f"iterations={iterations}, batch_sizes={batch_sizes}", flush=True)

    results = []
    for cfg in configs:
        for bs in batch_sizes:
            bs = int(bs)
            backend = "unknown"
            ok = False

            if is_gpu and HAS_TORCH:
                # GPU 路径：PyTorch (supports multi-GPU DataParallel)
                raw_model = TorchMLP(cfg["in"], cfg["hid"], cfg["out"]).eval()
                model, actual_device, effective_gpus = setup_model_for_inference(raw_model, chip_info, params)
                effective_bs = bs * effective_gpus  # 多卡时 batch 线性扩展
                inp_tensor = torch.randn(effective_bs, cfg["in"], device=actual_device)
                fn = lambda x, m=model: m(x)
                perf = bench_gpu(fn, inp_tensor, iters=iterations)
                with torch.no_grad():
                    out = fn(inp_tensor)
                probs = out.cpu().numpy()
                ok = bool(np.allclose(np.sum(probs, axis=-1), 1.0, atol=1e-4)) and bool(np.all(probs >= 0))
                gpu_name = torch.cuda.get_device_name(actual_device)
                backend = f"PyTorch-CUDA ({gpu_name})"
                if effective_gpus > 1:
                    backend += f" x{effective_gpus} DataParallel"
            elif HAS_TORCH and device is not None and device.type == "cpu":
                # PyTorch CPU 路径
                model = TorchMLP(cfg["in"], cfg["hid"], cfg["out"]).eval()
                inp_tensor = torch.randn(bs, cfg["in"])
                fn = lambda x, m=model: m(x)
                perf = bench_cpu(fn, inp_tensor, iters=iterations)
                with torch.no_grad():
                    out = fn(inp_tensor)
                probs = out.numpy()
                ok = bool(np.allclose(np.sum(probs, axis=-1), 1.0, atol=1e-4)) and bool(np.all(probs >= 0))
                backend = "PyTorch-CPU"
            else:
                # NumPy / ONNX fallback
                mp = os.path.join(assets_dir, cfg["name"].lower().replace("-", "_") + ".onnx")
                use_ort = False
                sess = None
                if create_onnx_model(mp, cfg["in"], cfg["hid"], cfg["out"]) and HAS_ORT:
                    try:
                        sess = ort.InferenceSession(mp, providers=["CPUExecutionProvider"])
                        use_ort = True
                    except Exception:
                        pass
                W = {
                    "W1": np.random.randn(cfg["in"], cfg["hid"]).astype(np.float32) * 0.01,
                    "B1": np.zeros(cfg["hid"]).astype(np.float32),
                    "W2": np.random.randn(cfg["hid"], cfg["out"]).astype(np.float32) * 0.01,
                    "B2": np.zeros(cfg["out"]).astype(np.float32),
                }
                inp = np.random.randn(bs, cfg["in"]).astype(np.float32)
                if use_ort:
                    iname = sess.get_inputs()[0].name
                    fn = lambda x, s=sess, n=iname: s.run(None, {n: x})
                    backend = "ONNXRuntime-CPU"
                else:
                    fn = lambda x, w=W: numpy_mlp(x, w)
                    backend = "NumPy"
                perf = bench_cpu(fn, inp, iters=iterations)
                out = fn(inp)
                probs = out[0] if isinstance(out, list) else out
                ok = bool(np.allclose(np.sum(probs, axis=-1), 1.0, atol=1e-4)) and bool(np.all(probs >= 0))

            result_entry = {
                "model": cfg["name"], "description": cfg["desc"],
                "backend": backend, "batch_size": bs,
                "device": get_device_str(device),
                "input_shape": f"[{bs},{cfg['in']}]",
                "output_shape": f"[{bs},{cfg['out']}]",
                "model_params": cfg["in"] * cfg["hid"] + cfg["hid"] + cfg["hid"] * cfg["out"] + cfg["out"],
                **perf,
                "accuracy_checks": {"softmax_valid": ok},
                "status": "PASS" if ok else "FAIL",
            }
            if is_gpu and HAS_TORCH:
                result_entry.update(get_gpu_info(actual_device))
                result_entry["gpu_count"] = effective_gpus
                result_entry["effective_batch_size"] = effective_bs
            results.append(result_entry)

            print(f"[METRIC] {cfg['name']} bs={bs}: latency_mean={perf['latency_ms_mean']:.3f}ms, "
                  f"qps={perf['throughput_qps']:.1f}, backend={backend}", flush=True)

    pc = sum(1 for r in results if r["status"] == "PASS")
    al = np.mean([r["latency_ms_mean"] for r in results])
    aq = np.mean([r["throughput_qps"] for r in results])

    output = {
        "benchmark_name": "model_inference", "benchmark_version": "2.0",
        "timestamp": datetime.now().isoformat(),
        "system_info": get_system_info(),
        "config": {
            "iterations": iterations, "batch_sizes": batch_sizes,
            "model_filter": model_filter, "device": get_device_str(device),
            "gpu_count": params.get("_gpu_count", 0),
            "parallel_mode": params.get("_parallel_mode", "none"),
        },
        "results": results,
        "summary": {
            "total_tests": len(results), "passed": pc,
            "failed": len(results) - pc,
            "pass_rate": round(pc / len(results) * 100, 1),
            "avg_latency_ms": round(al, 3),
            "avg_throughput_qps": round(aq, 1),
            "device": get_device_str(device),
        },
        "conclusion": f"共测试{len(results)}项推理，{pc}项通过。平均延迟{al:.2f}ms，平均吞吐{aq:.0f}QPS。设备: {get_device_str(device)}"
    }

    if is_gpu and HAS_TORCH:
        output["gpu_info"] = get_gpu_info(device)

    print(f"[EVAL] === 推理测试完成 === {pc}/{len(results)} PASS, device={get_device_str(device)}", flush=True)
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
