"""
精度验证工具模块
Issue: #235 — 参考实现对比 + 精度指标计算
"""
import numpy as np
import math


# ── 默认阈值配置 ──
DEFAULT_THRESHOLDS = {
    "FP32": {
        "max_abs_error": {"pass": 1e-3, "warn": 1e-1},
        "mean_abs_error": {"pass": 1e-4, "warn": 1e-2},
        "max_rel_error": {"pass": 0.5, "warn": 1.0},
        "mean_rel_error": {"pass": 1e-5, "warn": 1e-3},
        "cosine_similarity": {"pass": 0.99999, "warn": 0.9999},
        "snr_db": {"pass": 100, "warn": 60},
    },
    "FP16": {
        "max_abs_error": {"pass": 1e-2, "warn": 1e-1},
        "mean_abs_error": {"pass": 1e-3, "warn": 1e-2},
        "max_rel_error": {"pass": 1e-2, "warn": 5e-2},
        "mean_rel_error": {"pass": 1e-3, "warn": 1e-2},
        "cosine_similarity": {"pass": 0.999, "warn": 0.99},
        "snr_db": {"pass": 40, "warn": 20},
    },
}


def compute_accuracy_metrics(output, reference, dtype_name="FP32"):
    """
    计算精度指标。
    output: 被测精度的输出（np.ndarray）
    reference: FP64 参考实现输出（np.ndarray）
    返回: dict with all accuracy metrics
    """
    out = output.flatten().astype(np.float64)
    ref = reference.flatten().astype(np.float64)

    # 绝对误差
    abs_err = np.abs(out - ref)
    max_abs_error = float(np.max(abs_err))
    mean_abs_error = float(np.mean(abs_err))

    # 相对误差（避免除零）
    denom = np.maximum(np.abs(ref), 1e-12)
    rel_err = abs_err / denom
    max_rel_error = float(np.max(rel_err))
    mean_rel_error = float(np.mean(rel_err))

    # 余弦相似度
    dot = np.dot(out, ref)
    norm_out = np.linalg.norm(out)
    norm_ref = np.linalg.norm(ref)
    if norm_out > 0 and norm_ref > 0:
        cosine_sim = float(dot / (norm_out * norm_ref))
    else:
        cosine_sim = 1.0 if np.allclose(out, ref) else 0.0

    # MSE
    mse = float(np.mean((out - ref) ** 2))

    # SNR (信噪比)
    signal_power = np.mean(ref ** 2)
    noise_power = np.mean((out - ref) ** 2)
    if noise_power > 0:
        snr_db = float(10 * math.log10(signal_power / noise_power))
    else:
        snr_db = float('inf')

    return {
        "max_abs_error": round(max_abs_error, 10),
        "mean_abs_error": round(mean_abs_error, 10),
        "max_rel_error": round(max_rel_error, 10),
        "mean_rel_error": round(mean_rel_error, 10),
        "cosine_similarity": round(cosine_sim, 8),
        "mse": round(mse, 12),
        "snr_db": round(snr_db, 2) if snr_db != float('inf') else 999.99,
        "dtype": dtype_name,
    }


def judge_accuracy(metrics, dtype_name="FP32", custom_thresholds=None):
    """
    三级判定：PASS / WARNING / FAIL
    metrics: compute_accuracy_metrics 的返回值
    返回: (verdict, details)
    """
    thresholds = custom_thresholds or DEFAULT_THRESHOLDS.get(dtype_name, DEFAULT_THRESHOLDS["FP32"])

    verdicts = {}
    for key in ["max_abs_error", "mean_abs_error", "max_rel_error", "mean_rel_error"]:
        val = metrics.get(key, float('inf'))
        th = thresholds.get(key, {"pass": 1e-5, "warn": 1e-3})
        if val <= th["pass"]:
            verdicts[key] = "PASS"
        elif val <= th["warn"]:
            verdicts[key] = "WARNING"
        else:
            verdicts[key] = "FAIL"

    # cosine_similarity: higher is better
    cos = metrics.get("cosine_similarity", 0)
    th_cos = thresholds.get("cosine_similarity", {"pass": 0.99999, "warn": 0.9999})
    if cos >= th_cos["pass"]:
        verdicts["cosine_similarity"] = "PASS"
    elif cos >= th_cos["warn"]:
        verdicts["cosine_similarity"] = "WARNING"
    else:
        verdicts["cosine_similarity"] = "FAIL"

    # snr_db: higher is better
    snr = metrics.get("snr_db", 0)
    th_snr = thresholds.get("snr_db", {"pass": 100, "warn": 60})
    if snr >= th_snr["pass"]:
        verdicts["snr_db"] = "PASS"
    elif snr >= th_snr["warn"]:
        verdicts["snr_db"] = "WARNING"
    else:
        verdicts["snr_db"] = "FAIL"

    # Overall verdict
    if any(v == "FAIL" for v in verdicts.values()):
        overall = "FAIL"
    elif any(v == "WARNING" for v in verdicts.values()):
        overall = "WARNING"
    else:
        overall = "PASS"

    return overall, verdicts


def get_flops_for_op(op_name, **kwargs):
    """
    #236: 计算算子的理论 FLOPs
    MatMul [M,K]x[K,N]: 2*M*N*K
    Conv2D NCHW: 2*N*Cout*Hout*Wout*Cin*KH*KW
    Softmax [d1,...,dn]: 5*product(shape) (exp + sub + sum + div + max)
    LayerNorm: 5*product(shape)
    ReLU/GELU/SiLU/Sigmoid: ~product(shape)
    Attention [B,H,S,D]: 2*B*H*S*S*D (QK^T) + 5*B*H*S*S (softmax) + 2*B*H*S*S*D (AV)
    """
    name = op_name.lower()

    if name == "matmul":
        shape_a = kwargs.get("shape_a", [512, 512])
        shape_b = kwargs.get("shape_b", [512, 512])
        M, K = shape_a[0], shape_a[1]
        N = shape_b[1] if len(shape_b) > 1 else shape_b[0]
        return 2 * M * N * K

    elif name == "conv2d":
        input_shape = kwargs.get("input_shape", [1, 3, 224, 224])
        kernel_shape = kwargs.get("kernel_shape", [64, 3, 3, 3])
        stride = kwargs.get("stride", 1)
        padding = kwargs.get("padding", 0)
        N, Cin, H, W = input_shape
        Cout, _, KH, KW = kernel_shape
        Hout = (H + 2*padding - KH) // stride + 1
        Wout = (W + 2*padding - KW) // stride + 1
        return 2 * N * Cout * Hout * Wout * Cin * KH * KW

    elif name == "attention":
        qkv = kwargs.get("qkv_shape", [1, 8, 128, 64])
        B, H, S, D = qkv
        # QK^T: 2*B*H*S*D*S, softmax: 5*B*H*S*S, AV: 2*B*H*S*S*D
        return 2*B*H*S*D*S + 5*B*H*S*S + 2*B*H*S*S*D

    elif name in ("softmax", "layernorm"):
        shape = kwargs.get("shape", [512, 512])
        return 5 * int(np.prod(shape))

    elif name in ("gelu", "silu", "swish"):
        shape = kwargs.get("shape", [512, 512])
        return 8 * int(np.prod(shape))  # tanh + exp + mul etc.

    elif name in ("relu", "sigmoid"):
        shape = kwargs.get("shape", [512, 512])
        return int(np.prod(shape))

    elif name == "batchnorm":
        shape = kwargs.get("shape", [512, 512])
        return 5 * int(np.prod(shape))

    elif name == "transpose":
        shape = kwargs.get("shape", [512, 512])
        return int(np.prod(shape))

    elif name == "matinverse":
        n = kwargs.get("size", 64)
        return n ** 3  # O(n^3) for LU decomposition

    elif name == "svd":
        shape = kwargs.get("shape", [64, 64])
        m, n = shape[0], shape[1]
        return 4 * m * n * n  # approximate

    return 0
