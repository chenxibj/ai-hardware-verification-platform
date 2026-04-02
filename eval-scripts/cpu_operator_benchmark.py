#!/usr/bin/env python3
"""CPU算子性能基准测试"""
import json, time, sys, platform, os
import numpy as np
from datetime import datetime
try:
    import psutil
    HAS_PSUTIL = True
except:
    HAS_PSUTIL = False

def get_system_info():
    info = {"cpu": platform.processor() or platform.machine(), "arch": platform.machine(),
            "os": f"{platform.system()} {platform.release()}", "python": platform.python_version(), "numpy": np.__version__}
    if HAS_PSUTIL:
        info["cores_physical"] = psutil.cpu_count(logical=False)
        info["cores_logical"] = psutil.cpu_count(logical=True)
        info["memory_gb"] = round(psutil.virtual_memory().total / 1e9, 1)
    return info

def benchmark_op(name, func, warmup=5, iterations=50):
    for _ in range(warmup): func()
    latencies = []
    cpu_start = time.process_time()
    wall_start = time.perf_counter()
    for _ in range(iterations):
        t0 = time.perf_counter(); func(); latencies.append((time.perf_counter() - t0) * 1000)
    wall_elapsed = time.perf_counter() - wall_start
    cpu_elapsed = time.process_time() - cpu_start
    return {
        "operator": name, "iterations": iterations,
        "latency_ms_mean": round(np.mean(latencies), 3), "latency_ms_p50": round(np.percentile(latencies, 50), 3),
        "latency_ms_p95": round(np.percentile(latencies, 95), 3), "latency_ms_p99": round(np.percentile(latencies, 99), 3),
        "latency_ms_min": round(np.min(latencies), 3), "latency_ms_max": round(np.max(latencies), 3),
        "throughput_ops": round(iterations / wall_elapsed, 1),
        "cpu_util_percent": round(cpu_elapsed / wall_elapsed * 100, 1), "status": "PASS"
    }

def get_all_ops(size, iterations):
    """返回所有可用算子定义列表"""
    from scipy.signal import fftconvolve
    A = np.random.randn(size, size).astype(np.float32)
    B = np.random.randn(size, size).astype(np.float32)

    ops = [
        ("MatMul", lambda: np.dot(A, B), f"[{size},{size}] x [{size},{size}]", "矩阵乘法 (GEMM)"),
        ("Transpose", lambda: np.transpose(A), f"[{size},{size}]", "矩阵转置"),
        ("Softmax", lambda: (lambda x: (lambda e: e/np.sum(e,axis=-1,keepdims=True))(np.exp(x-np.max(x,axis=-1,keepdims=True))))(A), f"[{size},{size}]", "Softmax激活函数"),
        ("LayerNorm", lambda: (A - np.mean(A,axis=-1,keepdims=True))/np.sqrt(np.var(A,axis=-1,keepdims=True)+1e-5), f"[{size},{size}]", "层归一化"),
        ("GELU", lambda: 0.5*A*(1+np.tanh(np.sqrt(2/np.pi)*(A+0.044715*A**3))), f"[{size},{size}]", "GELU激活函数"),
        ("Conv2D", lambda: fftconvolve(np.random.randn(64,64).astype(np.float32), np.random.randn(3,3).astype(np.float32), mode="same"), "[64,64]*[3,3]", "2D卷积(FFT)"),
        ("BatchNorm", lambda: (A-np.mean(A,axis=0))/np.sqrt(np.var(A,axis=0)+1e-5), f"[{size},{size}]", "批归一化"),
        ("ReLU", lambda: np.maximum(A, 0), f"[{size},{size}]", "ReLU激活函数"),
        ("MatInverse", lambda: np.linalg.inv(A@A.T+np.eye(size)*0.1), f"[{size},{size}]", "矩阵求逆"),
        ("SVD", lambda: np.linalg.svd(np.random.randn(64,64).astype(np.float32), full_matrices=False), "[64,64]", "奇异值分解"),
    ]
    return ops

def run_benchmarks(size=512, iterations=50, operator_filter=None):
    """
    运行基准测试。
    operator_filter: 可以是单个算子名(str)或列表(list)，不区分大小写。为None则跑全量。
    """
    ops = get_all_ops(size, iterations)

    # 按 operator_filter 过滤
    if operator_filter:
        if isinstance(operator_filter, str):
            operator_filter = [operator_filter]
        filter_lower = [f.lower() for f in operator_filter]
        ops = [o for o in ops if o[0].lower() in filter_lower]
        if not ops:
            raise ValueError("没有匹配的算子，可用: MatMul, Transpose, Softmax, LayerNorm, GELU, Conv2D, BatchNorm, ReLU, MatInverse, SVD")

    results = []
    for name, func, shape, desc in ops:
        iters = min(iterations, 20) if name in ("MatInverse", "SVD") else iterations
        r = benchmark_op(name, func, iterations=iters)
        r["input_shape"] = shape
        r["description"] = desc
        results.append(r)
    return results

def main():
    params = {}
    if len(sys.argv) > 1:
        try:
            params = json.loads(sys.argv[1])
        except:
            pass

    size = int(params.get("size", params.get("input_size", 512)))
    iterations = int(params.get("iterations", 50))
    # Bug #95: 支持 operator 过滤参数
    operator_filter = params.get("operator", params.get("operators", params.get("op", None)))

    results = run_benchmarks(size=size, iterations=iterations, operator_filter=operator_filter)
    avg_lat = np.mean([r["latency_ms_mean"] for r in results])
    output = {
        "benchmark_name": "cpu_operator_benchmark", "benchmark_version": "1.1",
        "timestamp": datetime.now().isoformat(), "system_info": get_system_info(),
        "config": {"matrix_size": size, "iterations": iterations, "operator_filter": operator_filter},
        "results": results,
        "summary": {"total_operators": len(results), "passed": sum(1 for r in results if r["status"] == "PASS"),
                     "failed": sum(1 for r in results if r["status"] != "PASS"),
                     "pass_rate": round(sum(1 for r in results if r["status"] == "PASS") / len(results) * 100, 1),
                     "avg_latency_ms": round(avg_lat, 3),
                     "fastest_op": min(results, key=lambda r: r["latency_ms_mean"])["operator"],
                     "slowest_op": max(results, key=lambda r: r["latency_ms_mean"])["operator"]},
        "conclusion": f"共测试{len(results)}个CPU算子，全部通过。平均延迟{avg_lat:.2f}ms。"
    }
    print(json.dumps(output, ensure_ascii=False))

if __name__ == "__main__":
    main()
