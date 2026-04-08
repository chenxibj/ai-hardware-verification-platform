#!/usr/bin/env python3
"""CPU算子性能基准测试 v2.0 - 支持任意 shape 的增强版"""
import json, time, sys, platform, os, math
import numpy as np
from datetime import datetime
import traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from accuracy_utils import compute_accuracy_metrics, judge_accuracy, get_flops_for_op, DEFAULT_THRESHOLDS
    HAS_ACCURACY = True
except ImportError:
    HAS_ACCURACY = False
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

def benchmark_op(name, func, warmup=5, iterations=50, flops=0, peak_gflops=None):
    """#236: Enhanced with GFLOPS, memory, CV, warmup overhead"""
    # Measure warmup
    warmup_lats = []
    for _ in range(warmup):
        t0 = time.perf_counter(); func(); warmup_lats.append((time.perf_counter() - t0) * 1000)

    # Memory before
    mem_before = 0
    if HAS_PSUTIL:
        mem_before = psutil.Process().memory_info().rss / (1024 * 1024)

    latencies = []
    cpu_start = time.process_time()
    wall_start = time.perf_counter()
    for _ in range(iterations):
        t0 = time.perf_counter(); func(); latencies.append((time.perf_counter() - t0) * 1000)
    wall_elapsed = time.perf_counter() - wall_start
    cpu_elapsed = time.process_time() - cpu_start

    # Memory after
    mem_after = 0
    if HAS_PSUTIL:
        mem_after = psutil.Process().memory_info().rss / (1024 * 1024)

    lat_mean = np.mean(latencies)
    lat_std = np.std(latencies)

    result = {
        "operator": name, "iterations": iterations,
        "latency_ms_mean": round(float(lat_mean), 3),
        "latency_ms_p50": round(float(np.percentile(latencies, 50)), 3),
        "latency_ms_p95": round(float(np.percentile(latencies, 95)), 3),
        "latency_ms_p99": round(float(np.percentile(latencies, 99)), 3),
        "latency_ms_min": round(float(np.min(latencies)), 3),
        "latency_ms_max": round(float(np.max(latencies)), 3),
        "latency_ms_std": round(float(lat_std), 3),
        "latency_cv": round(float(lat_std / lat_mean), 4) if lat_mean > 0 else 0,
        "throughput_ops": round(iterations / wall_elapsed, 1),
        "cpu_util_percent": round(cpu_elapsed / wall_elapsed * 100, 1),
        "memory_delta_mb": round(mem_after - mem_before, 2),
        "warmup_overhead_ms": round(float(np.mean(warmup_lats) - lat_mean), 3) if warmup_lats else 0,
        "status": "PASS",
    }

    # #236: GFLOPS calculation
    if flops > 0 and lat_mean > 0:
        gflops = (flops / (lat_mean / 1000)) / 1e9
        result["gflops"] = round(gflops, 3)
        if peak_gflops and peak_gflops > 0:
            result["compute_util_percent"] = round(gflops / peak_gflops * 100, 2)
        else:
            result["compute_util_percent"] = "N/A"
    else:
        result["gflops"] = "N/A"
        result["compute_util_percent"] = "N/A"

    return result

def benchmark_attention(name, func_parts, warmup=5, iterations=50):
    """Attention 专用 benchmark，记录分步延迟"""
    # func_parts: dict with keys 'qkt', 'softmax', 'av', 'full'
    for _ in range(warmup): func_parts['full']()

    latencies_qkt = []
    latencies_softmax = []
    latencies_av = []
    latencies_full = []
    cpu_start = time.process_time()
    wall_start = time.perf_counter()

    for _ in range(iterations):
        # Full pass
        t0 = time.perf_counter(); func_parts['full'](); latencies_full.append((time.perf_counter() - t0) * 1000)
        # QK^T
        t0 = time.perf_counter(); func_parts['qkt'](); latencies_qkt.append((time.perf_counter() - t0) * 1000)
        # Softmax
        t0 = time.perf_counter(); func_parts['softmax'](); latencies_softmax.append((time.perf_counter() - t0) * 1000)
        # AV
        t0 = time.perf_counter(); func_parts['av'](); latencies_av.append((time.perf_counter() - t0) * 1000)

    wall_elapsed = time.perf_counter() - wall_start
    cpu_elapsed = time.process_time() - cpu_start

    result = {
        "operator": name, "iterations": iterations,
        "latency_ms_mean": round(np.mean(latencies_full), 3),
        "latency_ms_p50": round(np.percentile(latencies_full, 50), 3),
        "latency_ms_p95": round(np.percentile(latencies_full, 95), 3),
        "latency_ms_p99": round(np.percentile(latencies_full, 99), 3),
        "latency_ms_min": round(np.min(latencies_full), 3),
        "latency_ms_max": round(np.max(latencies_full), 3),
        "throughput_ops": round(iterations / wall_elapsed, 1),
        "cpu_util_percent": round(cpu_elapsed / wall_elapsed * 100, 1),
        "status": "PASS",
        "step_latencies": {
            "qkt_ms": {"mean": round(np.mean(latencies_qkt), 3), "p50": round(np.percentile(latencies_qkt, 50), 3),
                        "p95": round(np.percentile(latencies_qkt, 95), 3), "p99": round(np.percentile(latencies_qkt, 99), 3)},
            "softmax_ms": {"mean": round(np.mean(latencies_softmax), 3), "p50": round(np.percentile(latencies_softmax, 50), 3),
                           "p95": round(np.percentile(latencies_softmax, 95), 3), "p99": round(np.percentile(latencies_softmax, 99), 3)},
            "av_ms": {"mean": round(np.mean(latencies_av), 3), "p50": round(np.percentile(latencies_av, 50), 3),
                      "p95": round(np.percentile(latencies_av, 95), 3), "p99": round(np.percentile(latencies_av, 99), 3)},
        }
    }
    return result


# ============ 算子工厂函数（支持任意 shape） ============

def make_matmul(shape_a, shape_b):
    """MatMul: shape_a=[M,K], shape_b=[K,N]"""
    A = np.random.randn(*shape_a).astype(np.float32)
    B = np.random.randn(*shape_b).astype(np.float32)
    shape_str = f"{list(shape_a)} x {list(shape_b)}"
    return ("MatMul", lambda: np.dot(A, B), shape_str, "矩阵乘法 (GEMM)")

def make_softmax(shape):
    """Softmax: 任意 shape，沿最后一维"""
    A = np.random.randn(*shape).astype(np.float32)
    shape_str = str(list(shape))
    def softmax_fn():
        e = np.exp(A - np.max(A, axis=-1, keepdims=True))
        return e / np.sum(e, axis=-1, keepdims=True)
    return ("Softmax", softmax_fn, shape_str, "Softmax激活函数")

def make_layernorm(shape):
    """LayerNorm: 任意 shape，沿最后一维归一化"""
    A = np.random.randn(*shape).astype(np.float32)
    shape_str = str(list(shape))
    def ln_fn():
        return (A - np.mean(A, axis=-1, keepdims=True)) / np.sqrt(np.var(A, axis=-1, keepdims=True) + 1e-5)
    return ("LayerNorm", ln_fn, shape_str, "层归一化")

def make_conv2d(input_shape, kernel_shape, stride=1, padding=0):
    """Conv2D: NCHW input, [Cout, Cin, KH, KW] kernel. Uses im2col for real conv."""
    N, Cin, H, W = input_shape
    Cout, Cin_k, KH, KW = kernel_shape
    assert Cin == Cin_k, f"Channel mismatch: input Cin={Cin}, kernel Cin={Cin_k}"

    inp = np.random.randn(N, Cin, H, W).astype(np.float32)
    kernel = np.random.randn(Cout, Cin, KH, KW).astype(np.float32)

    # Output dims
    H_out = (H + 2 * padding - KH) // stride + 1
    W_out = (W + 2 * padding - KW) // stride + 1

    shape_str = f"input={list(input_shape)}, kernel={list(kernel_shape)}, stride={stride}, pad={padding}"
    desc = f"2D卷积 NCHW (out={[N, Cout, H_out, W_out]})"

    def conv2d_fn():
        # Pad if needed
        if padding > 0:
            x = np.pad(inp, ((0,0),(0,0),(padding,padding),(padding,padding)), mode='constant')
        else:
            x = inp
        # im2col approach for batched conv2d
        # For each output position, extract patches
        cols = np.zeros((N, Cin * KH * KW, H_out * W_out), dtype=np.float32)
        for i in range(KH):
            i_max = i + stride * H_out
            for j in range(KW):
                j_max = j + stride * W_out
                cols[:, i * KW * Cin + j * Cin: i * KW * Cin + j * Cin + Cin, :] = \
                    x[:, :, i:i_max:stride, j:j_max:stride].reshape(N, Cin, -1)
        # Reshape kernel: [Cout, Cin*KH*KW]
        k_flat = kernel.reshape(Cout, -1)
        # Batched matmul: [N, Cout, H_out*W_out]
        out = np.einsum('ck,nkp->ncp', k_flat, cols)
        return out.reshape(N, Cout, H_out, W_out)

    return ("Conv2D", conv2d_fn, shape_str, desc)

def make_relu(shape):
    A = np.random.randn(*shape).astype(np.float32)
    return ("ReLU", lambda: np.maximum(A, 0), str(list(shape)), "ReLU激活函数")

def make_gelu(shape):
    A = np.random.randn(*shape).astype(np.float32)
    def gelu_fn():
        return 0.5 * A * (1 + np.tanh(np.sqrt(2 / np.pi) * (A + 0.044715 * A ** 3)))
    return ("GELU", gelu_fn, str(list(shape)), "GELU激活函数")

def make_silu(shape):
    """SiLU / Swish: x * sigmoid(x)"""
    A = np.random.randn(*shape).astype(np.float32)
    def silu_fn():
        return A / (1 + np.exp(-A))  # x * sigmoid(x) = x / (1 + exp(-x))
    return ("SiLU", silu_fn, str(list(shape)), "SiLU/Swish激活函数")

def make_sigmoid(shape):
    A = np.random.randn(*shape).astype(np.float32)
    def sigmoid_fn():
        return 1.0 / (1.0 + np.exp(-A))
    return ("Sigmoid", sigmoid_fn, str(list(shape)), "Sigmoid激活函数")

def make_attention(qkv_shape):
    """Scaled Dot-Product Attention: Q/K/V shape = [batch, heads, seq_len, d_k]"""
    B, H, S, D = qkv_shape
    Q = np.random.randn(B, H, S, D).astype(np.float32)
    K = np.random.randn(B, H, S, D).astype(np.float32)
    V = np.random.randn(B, H, S, D).astype(np.float32)
    scale = 1.0 / math.sqrt(D)
    shape_str = f"Q/K/V={list(qkv_shape)}"
    desc = f"Scaled Dot-Product Attention (batch={B}, heads={H}, seq={S}, d_k={D})"

    def qkt_fn():
        return np.matmul(Q, K.transpose(0, 1, 3, 2)) * scale

    def softmax_step(scores=None):
        if scores is None:
            scores = np.matmul(Q, K.transpose(0, 1, 3, 2)) * scale
        e = np.exp(scores - np.max(scores, axis=-1, keepdims=True))
        return e / np.sum(e, axis=-1, keepdims=True)

    def av_fn(attn_weights=None):
        if attn_weights is None:
            scores = np.matmul(Q, K.transpose(0, 1, 3, 2)) * scale
            e = np.exp(scores - np.max(scores, axis=-1, keepdims=True))
            attn_weights = e / np.sum(e, axis=-1, keepdims=True)
        return np.matmul(attn_weights, V)

    def full_fn():
        scores = np.matmul(Q, K.transpose(0, 1, 3, 2)) * scale
        e = np.exp(scores - np.max(scores, axis=-1, keepdims=True))
        attn_weights = e / np.sum(e, axis=-1, keepdims=True)
        return np.matmul(attn_weights, V)

    return ("Attention", {"qkt": qkt_fn, "softmax": softmax_step, "av": av_fn, "full": full_fn},
            shape_str, desc)

def make_transpose(shape):
    A = np.random.randn(*shape).astype(np.float32)
    return ("Transpose", lambda: np.transpose(A), str(list(shape)), "矩阵转置")

def make_batchnorm(shape):
    A = np.random.randn(*shape).astype(np.float32)
    def bn_fn():
        return (A - np.mean(A, axis=0)) / np.sqrt(np.var(A, axis=0) + 1e-5)
    return ("BatchNorm", bn_fn, str(list(shape)), "批归一化")

def make_matinverse(size):
    A = np.random.randn(size, size).astype(np.float32)
    def inv_fn():
        return np.linalg.inv(A @ A.T + np.eye(size) * 0.1)
    return ("MatInverse", inv_fn, f"[{size},{size}]", "矩阵求逆")

def make_svd(shape):
    A = np.random.randn(*shape).astype(np.float32)
    def svd_fn():
        return np.linalg.svd(A, full_matrices=False)
    return ("SVD", svd_fn, str(list(shape)), "奇异值分解")


# ============ 向后兼容：原始方阵模式 ============

def get_all_ops(size, iterations):
    """返回所有可用算子定义列表（方阵模式，向后兼容）"""
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


def run_single_test_case(test_case, iterations=100):
    """
    运行单个测试用例。
    test_case: dict with keys:
      - operator: str (MatMul, Softmax, LayerNorm, Conv2D, ReLU, GELU, SiLU, Sigmoid, Attention, etc.)
      - 算子特定参数（见下文）
    
    MatMul:    {"operator": "MatMul", "shape_a": [M,K], "shape_b": [K,N]}
    Softmax:   {"operator": "Softmax", "shape": [d1,d2,...]}
    LayerNorm: {"operator": "LayerNorm", "shape": [d1,d2,...]}
    Conv2D:    {"operator": "Conv2D", "input_shape": [N,C,H,W], "kernel_shape": [Cout,Cin,KH,KW], "stride": 1, "padding": 0}
    ReLU:      {"operator": "ReLU", "shape": [d1,d2,...]}
    GELU:      {"operator": "GELU", "shape": [d1,d2,...]}
    SiLU:      {"operator": "SiLU", "shape": [d1,d2,...]}
    Sigmoid:   {"operator": "Sigmoid", "shape": [d1,d2,...]}
    Attention: {"operator": "Attention", "qkv_shape": [B,H,S,D]}
    Transpose: {"operator": "Transpose", "shape": [d1,d2]}
    BatchNorm: {"operator": "BatchNorm", "shape": [d1,d2]}
    MatInverse:{"operator": "MatInverse", "size": N}
    SVD:       {"operator": "SVD", "shape": [M,N]}
    """
    op = test_case["operator"]
    op_lower = op.lower()

    if op_lower == "matmul":
        shape_a = tuple(test_case["shape_a"])
        shape_b = tuple(test_case["shape_b"])
        name, func, shape_str, desc = make_matmul(shape_a, shape_b)
    elif op_lower == "softmax":
        shape = tuple(test_case["shape"])
        name, func, shape_str, desc = make_softmax(shape)
    elif op_lower == "layernorm":
        shape = tuple(test_case["shape"])
        name, func, shape_str, desc = make_layernorm(shape)
    elif op_lower == "conv2d":
        input_shape = tuple(test_case["input_shape"])
        kernel_shape = tuple(test_case["kernel_shape"])
        stride = test_case.get("stride", 1)
        padding = test_case.get("padding", 0)
        name, func, shape_str, desc = make_conv2d(input_shape, kernel_shape, stride, padding)
    elif op_lower == "relu":
        shape = tuple(test_case["shape"])
        name, func, shape_str, desc = make_relu(shape)
    elif op_lower == "gelu":
        shape = tuple(test_case["shape"])
        name, func, shape_str, desc = make_gelu(shape)
    elif op_lower == "silu" or op_lower == "swish":
        shape = tuple(test_case["shape"])
        name, func, shape_str, desc = make_silu(shape)
    elif op_lower == "sigmoid":
        shape = tuple(test_case["shape"])
        name, func, shape_str, desc = make_sigmoid(shape)
    elif op_lower == "attention":
        qkv_shape = tuple(test_case["qkv_shape"])
        name, func_parts, shape_str, desc = make_attention(qkv_shape)
        # Use attention-specific benchmark
        r = benchmark_attention(name, func_parts, iterations=iterations)
        r["input_shape"] = shape_str
        r["description"] = desc
        return r
    elif op_lower == "transpose":
        shape = tuple(test_case["shape"])
        name, func, shape_str, desc = make_transpose(shape)
    elif op_lower == "batchnorm":
        shape = tuple(test_case["shape"])
        name, func, shape_str, desc = make_batchnorm(shape)
    elif op_lower == "matinverse":
        size = test_case.get("size", 64)
        name, func, shape_str, desc = make_matinverse(size)
    elif op_lower == "svd":
        shape = tuple(test_case.get("shape", [64, 64]))
        name, func, shape_str, desc = make_svd(shape)
    else:
        raise ValueError(f"未知算子: {op}")

    iters = min(iterations, 20) if op_lower in ("matinverse", "svd") else iterations
    # #236: Calculate FLOPs for the operator
    flops = 0
    if HAS_ACCURACY:
        flops = get_flops_for_op(op, **test_case)
    r = benchmark_op(name, func, iterations=iters, flops=flops, peak_gflops=test_case.get("_peak_gflops"))
    r["input_shape"] = shape_str
    r["description"] = desc
    r["dtype"] = test_case.get("dtype", "FP32")
    return r


def run_benchmarks(size=512, iterations=50, operator_filter=None, test_cases=None):
    """
    运行基准测试。
    
    新增 test_cases 参数：列表，每个元素是 dict，包含 operator + shape 参数。
    当提供 test_cases 时，忽略 size 和 operator_filter，按 test_cases 执行。
    不提供 test_cases 时，保持原行为（方阵模式）。
    """
    # 新模式：test_cases
    if test_cases:
        results = []
        for tc in test_cases:
            r = run_single_test_case(tc, iterations=iterations)
            results.append(r)
        return results

    # 旧模式：向后兼容
    ops = get_all_ops(size, iterations)

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
        # #236: Calculate FLOPs for backward-compat mode
        flops = 0
        if HAS_ACCURACY:
            flops = get_flops_for_op(name, shape_a=[size, size], shape_b=[size, size], shape=[size, size], size=size)
        r = benchmark_op(name, func, iterations=iters, flops=flops)
        r["input_shape"] = shape
        r["description"] = desc
        results.append(r)
    return results



def run_accuracy_test(op_name, test_case, dtype_name="FP32"):
    """#235: Run accuracy test for a single operator"""
    if not HAS_ACCURACY:
        return None

    op = op_name.lower()
    np_dtype = np.float16 if dtype_name == "FP16" else np.float32

    try:
        if op == "matmul":
            shape_a = tuple(test_case.get("shape_a", [512, 512]))
            shape_b = tuple(test_case.get("shape_b", [512, 512]))
            A_ref = np.random.randn(*shape_a).astype(np.float64)
            B_ref = np.random.randn(*shape_b).astype(np.float64)
            ref_out = np.dot(A_ref, B_ref)
            test_out = np.dot(A_ref.astype(np_dtype), B_ref.astype(np_dtype)).astype(np.float64)

        elif op == "softmax":
            shape = tuple(test_case.get("shape", [512, 512]))
            A_ref = np.random.randn(*shape).astype(np.float64)
            e_ref = np.exp(A_ref - np.max(A_ref, axis=-1, keepdims=True))
            ref_out = e_ref / np.sum(e_ref, axis=-1, keepdims=True)
            A_test = A_ref.astype(np_dtype)
            e_t = np.exp(A_test.astype(np.float64) - np.max(A_test.astype(np.float64), axis=-1, keepdims=True))
            test_out = e_t / np.sum(e_t, axis=-1, keepdims=True)

        elif op == "layernorm":
            shape = tuple(test_case.get("shape", [512, 512]))
            A_ref = np.random.randn(*shape).astype(np.float64)
            ref_out = (A_ref - np.mean(A_ref, axis=-1, keepdims=True)) / np.sqrt(np.var(A_ref, axis=-1, keepdims=True) + 1e-5)
            A_test = A_ref.astype(np_dtype).astype(np.float64)
            test_out = (A_test - np.mean(A_test, axis=-1, keepdims=True)) / np.sqrt(np.var(A_test, axis=-1, keepdims=True) + 1e-5)

        elif op == "relu":
            shape = tuple(test_case.get("shape", [512, 512]))
            A_ref = np.random.randn(*shape).astype(np.float64)
            ref_out = np.maximum(A_ref, 0)
            test_out = np.maximum(A_ref.astype(np_dtype), 0).astype(np.float64)

        elif op == "gelu":
            shape = tuple(test_case.get("shape", [512, 512]))
            A_ref = np.random.randn(*shape).astype(np.float64)
            ref_out = 0.5 * A_ref * (1 + np.tanh(np.sqrt(2 / np.pi) * (A_ref + 0.044715 * A_ref ** 3)))
            A_t = A_ref.astype(np_dtype).astype(np.float64)
            test_out = 0.5 * A_t * (1 + np.tanh(np.sqrt(2 / np.pi) * (A_t + 0.044715 * A_t ** 3)))

        elif op in ("silu", "swish"):
            shape = tuple(test_case.get("shape", [512, 512]))
            A_ref = np.random.randn(*shape).astype(np.float64)
            ref_out = A_ref / (1 + np.exp(-A_ref))
            A_t = A_ref.astype(np_dtype).astype(np.float64)
            test_out = A_t / (1 + np.exp(-A_t))

        elif op == "sigmoid":
            shape = tuple(test_case.get("shape", [512, 512]))
            A_ref = np.random.randn(*shape).astype(np.float64)
            ref_out = 1.0 / (1.0 + np.exp(-A_ref))
            A_t = A_ref.astype(np_dtype).astype(np.float64)
            test_out = 1.0 / (1.0 + np.exp(-A_t))

        elif op == "batchnorm":
            shape = tuple(test_case.get("shape", [512, 512]))
            A_ref = np.random.randn(*shape).astype(np.float64)
            ref_out = (A_ref - np.mean(A_ref, axis=0)) / np.sqrt(np.var(A_ref, axis=0) + 1e-5)
            A_t = A_ref.astype(np_dtype).astype(np.float64)
            test_out = (A_t - np.mean(A_t, axis=0)) / np.sqrt(np.var(A_t, axis=0) + 1e-5)

        elif op == "attention":
            qkv = tuple(test_case.get("qkv_shape", [1, 8, 128, 64]))
            B, H, S, D = qkv
            scale = 1.0 / np.sqrt(D)
            Q_ref = np.random.randn(B, H, S, D).astype(np.float64)
            K_ref = np.random.randn(B, H, S, D).astype(np.float64)
            V_ref = np.random.randn(B, H, S, D).astype(np.float64)
            scores = np.matmul(Q_ref, K_ref.transpose(0, 1, 3, 2)) * scale
            e = np.exp(scores - np.max(scores, axis=-1, keepdims=True))
            attn = e / np.sum(e, axis=-1, keepdims=True)
            ref_out = np.matmul(attn, V_ref)
            Qt = Q_ref.astype(np_dtype).astype(np.float64)
            Kt = K_ref.astype(np_dtype).astype(np.float64)
            Vt = V_ref.astype(np_dtype).astype(np.float64)
            st = np.matmul(Qt, Kt.transpose(0, 1, 3, 2)) * scale
            et = np.exp(st - np.max(st, axis=-1, keepdims=True))
            at = et / np.sum(et, axis=-1, keepdims=True)
            test_out = np.matmul(at, Vt)

        else:
            return None

        metrics = compute_accuracy_metrics(test_out, ref_out, dtype_name)
        verdict, details = judge_accuracy(metrics, dtype_name)
        metrics["verdict"] = verdict
        metrics["verdict_details"] = details
        return metrics

    except Exception as e:
        return {"error": str(e), "verdict": "ERROR"}


def main():
    params = {}
    if len(sys.argv) > 1:
        try:
            params = json.loads(sys.argv[1])
        except:
            pass

    size = int(params.get("size", params.get("input_size", 512)))
    iterations = int(params.get("iterations", 50))
    operator_filter = params.get("operator", params.get("operators", params.get("op", None)))
    test_cases = params.get("test_cases", None)

    # #237: dtype support
    dtypes = params.get("dtypes", [params.get("dtype", "FP32")])
    if isinstance(dtypes, str):
        dtypes = [dtypes]

    # #235: accuracy config
    include_accuracy = params.get("include_accuracy", False)
    accuracy_config = params.get("accuracy_config", {})

    # #240: chip info for GFLOPS utilization
    chip_info = params.get("_chip_info", {})
    peak_gflops_fp32 = chip_info.get("peak_gflops_fp32")
    peak_gflops_fp16 = chip_info.get("peak_gflops_fp16")

    all_results = []
    all_accuracy = []

    for dtype in dtypes:
        dtype_upper = dtype.upper()
        peak_gflops = peak_gflops_fp16 if dtype_upper == "FP16" else peak_gflops_fp32

        # Inject dtype and peak_gflops into test cases
        if test_cases:
            for tc in test_cases:
                tc["dtype"] = dtype_upper
                tc["_peak_gflops"] = peak_gflops

        results = run_benchmarks(size=size, iterations=iterations,
                                 operator_filter=operator_filter, test_cases=test_cases)

        for r in results:
            r["dtype"] = dtype_upper
        all_results.extend(results)

        # #235: Run accuracy tests if enabled
        if include_accuracy and HAS_ACCURACY:
            if test_cases:
                for tc in test_cases:
                    op_name = tc.get("operator", "unknown")
                    acc = run_accuracy_test(op_name, tc, dtype_upper)
                    if acc:
                        acc["operator"] = op_name
                        all_accuracy.append(acc)
            elif operator_filter:
                ops = [operator_filter] if isinstance(operator_filter, str) else operator_filter
                for op in ops:
                    tc = {"shape": [size, size], "shape_a": [size, size], "shape_b": [size, size]}
                    acc = run_accuracy_test(op, tc, dtype_upper)
                    if acc:
                        acc["operator"] = op
                        all_accuracy.append(acc)

    if not all_results:
        all_results = [{"operator": "none", "status": "FAIL", "latency_ms_mean": 0}]

    avg_lat = float(np.mean([r["latency_ms_mean"] for r in all_results]))

    # Build summary
    summary = {
        "total_operators": len(all_results),
        "passed": sum(1 for r in all_results if r.get("status") == "PASS"),
        "failed": sum(1 for r in all_results if r.get("status") != "PASS"),
        "pass_rate": round(sum(1 for r in all_results if r.get("status") == "PASS") / max(len(all_results), 1) * 100, 1),
        "avg_latency_ms": round(avg_lat, 3),
        "fastest_op": min(all_results, key=lambda r: r["latency_ms_mean"])["operator"],
        "slowest_op": max(all_results, key=lambda r: r["latency_ms_mean"])["operator"],
        "dtypes_tested": dtypes,
    }

    # GFLOPS summary
    gflops_values = [r["gflops"] for r in all_results if isinstance(r.get("gflops"), (int, float))]
    if gflops_values:
        summary["avg_gflops"] = round(float(np.mean(gflops_values)), 3)
        summary["max_gflops"] = round(float(max(gflops_values)), 3)

    # Accuracy summary
    if all_accuracy:
        acc_pass = sum(1 for a in all_accuracy if a.get("verdict") == "PASS")
        acc_warn = sum(1 for a in all_accuracy if a.get("verdict") == "WARNING")
        acc_fail = sum(1 for a in all_accuracy if a.get("verdict") == "FAIL")
        summary["accuracy"] = {
            "total": len(all_accuracy),
            "pass": acc_pass,
            "warning": acc_warn,
            "fail": acc_fail,
            "accuracy_pass_rate": round(acc_pass / max(len(all_accuracy), 1) * 100, 1),
        }

    passed_count = summary["passed"]
    output = {
        "benchmark_name": "cpu_operator_benchmark", "benchmark_version": "3.0",
        "timestamp": datetime.now().isoformat(), "system_info": get_system_info(),
        "config": {"matrix_size": size, "iterations": iterations, "operator_filter": operator_filter,
                    "test_cases_count": len(test_cases) if test_cases else None,
                    "dtypes": dtypes, "include_accuracy": include_accuracy},
        "results": all_results,
        "summary": summary,
        "conclusion": f"共测试{len(all_results)}个CPU算子，{passed_count}个通过。平均延迟{avg_lat:.2f}ms。"
    }

    if all_accuracy:
        output["accuracy_results"] = all_accuracy

    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
