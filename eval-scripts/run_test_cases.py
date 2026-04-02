#!/usr/bin/env python3
"""
测试用例执行脚本 - 包含 #87-#91 所有测试用例
直接调用增强后的 cpu_operator_benchmark 函数
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cpu_operator_benchmark import run_benchmarks, run_single_test_case
import numpy as np
from datetime import datetime

# ============================================================
# Issue #87: MatMul Benchmark - 5 种 shape
# ============================================================
MATMUL_CASES = [
    {"operator": "MatMul", "shape_a": [256, 256], "shape_b": [256, 256],   "label": "TC-87-01 Square 256"},
    {"operator": "MatMul", "shape_a": [512, 512], "shape_b": [512, 512],   "label": "TC-87-02 Square 512"},
    {"operator": "MatMul", "shape_a": [1, 784],   "shape_b": [784, 512],   "label": "TC-87-03 MNIST FC1"},
    {"operator": "MatMul", "shape_a": [32, 768],  "shape_b": [768, 3072],  "label": "TC-87-04 BERT FFN"},
    {"operator": "MatMul", "shape_a": [64, 1024], "shape_b": [1024, 1024], "label": "TC-87-05 Large Square"},
]

# ============================================================
# Issue #88: Softmax + LayerNorm - 各 3 种 shape
# ============================================================
SOFTMAX_CASES = [
    {"operator": "Softmax", "shape": [32, 128, 128],       "label": "TC-88-01 Softmax 3D"},
    {"operator": "Softmax", "shape": [4, 8, 512, 512],     "label": "TC-88-02 Softmax 4D (Attention-like)"},
    {"operator": "Softmax", "shape": [1, 1000],            "label": "TC-88-03 Softmax 2D (Classification)"},
]
LAYERNORM_CASES = [
    {"operator": "LayerNorm", "shape": [1, 128, 768],      "label": "TC-88-04 LN BERT single"},
    {"operator": "LayerNorm", "shape": [32, 128, 768],     "label": "TC-88-05 LN BERT batch"},
    {"operator": "LayerNorm", "shape": [8, 256, 1024],     "label": "TC-88-06 LN Large"},
]

# ============================================================
# Issue #89: Conv2D - 4 种配置
# ============================================================
CONV2D_CASES = [
    {"operator": "Conv2D", "input_shape": [1, 1, 28, 28],   "kernel_shape": [32, 1, 3, 3],   "stride": 1, "padding": 1,  "label": "TC-89-01 MNIST Conv1"},
    {"operator": "Conv2D", "input_shape": [1, 32, 14, 14],  "kernel_shape": [64, 32, 3, 3],  "stride": 1, "padding": 1,  "label": "TC-89-02 MNIST Conv2"},
    {"operator": "Conv2D", "input_shape": [1, 3, 224, 224], "kernel_shape": [64, 3, 7, 7],   "stride": 2, "padding": 3,  "label": "TC-89-03 ResNet Conv1"},
    {"operator": "Conv2D", "input_shape": [1, 64, 56, 56],  "kernel_shape": [128, 64, 3, 3], "stride": 1, "padding": 1,  "label": "TC-89-04 ResNet Block"},
]

# ============================================================
# Issue #90: 激活函数对比 - 4 种 (ReLU, GELU, SiLU, Sigmoid)
# ============================================================
ACTIVATION_SHAPE = [32, 768]
ACTIVATION_CASES = [
    {"operator": "ReLU",    "shape": ACTIVATION_SHAPE, "label": "TC-90-01 ReLU"},
    {"operator": "GELU",    "shape": ACTIVATION_SHAPE, "label": "TC-90-02 GELU"},
    {"operator": "SiLU",    "shape": ACTIVATION_SHAPE, "label": "TC-90-03 SiLU/Swish"},
    {"operator": "Sigmoid", "shape": ACTIVATION_SHAPE, "label": "TC-90-04 Sigmoid"},
]

# ============================================================
# Issue #91: Scaled Dot-Product Attention - 3 种配置
# ============================================================
ATTENTION_CASES = [
    {"operator": "Attention", "qkv_shape": [1, 8, 128, 64],  "label": "TC-91-01 Single-batch 8-head"},
    {"operator": "Attention", "qkv_shape": [4, 8, 128, 64],  "label": "TC-91-02 Batch-4 8-head"},
    {"operator": "Attention", "qkv_shape": [1, 12, 256, 64], "label": "TC-91-03 12-head long-seq"},
]


ALL_ISSUE_CASES = {
    87: ("MatMul Benchmark", MATMUL_CASES),
    88: ("Softmax + LayerNorm", SOFTMAX_CASES + LAYERNORM_CASES),
    89: ("Conv2D Benchmark", CONV2D_CASES),
    90: ("Activation Functions", ACTIVATION_CASES),
    91: ("Attention Benchmark", ATTENTION_CASES),
}


def run_issue_cases(issue_id, iterations=100):
    """运行指定 issue 的所有测试用例"""
    if issue_id not in ALL_ISSUE_CASES:
        raise ValueError(f"Unknown issue: #{issue_id}")
    
    title, cases = ALL_ISSUE_CASES[issue_id]
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"Issue #{issue_id}: {title} ({len(cases)} test cases, {iterations} iterations)", file=sys.stderr)
    print(f"{'='*60}", file=sys.stderr)
    
    results = []
    for i, tc in enumerate(cases):
        label = tc.get("label", f"Case {i+1}")
        print(f"  [{i+1}/{len(cases)}] {label} ...", file=sys.stderr, end=" ", flush=True)
        r = run_single_test_case(tc, iterations=iterations)
        r["test_label"] = label
        results.append(r)
        print(f"PASS (mean={r['latency_ms_mean']}ms, p50={r['latency_ms_p50']}ms, p95={r['latency_ms_p95']}ms, p99={r['latency_ms_p99']}ms)", file=sys.stderr)
    
    return {"issue_id": issue_id, "title": title, "results": results}


def run_all(iterations=100):
    """运行全部 #87-#91 测试用例"""
    all_results = {}
    for issue_id in sorted(ALL_ISSUE_CASES.keys()):
        all_results[issue_id] = run_issue_cases(issue_id, iterations=iterations)
    return all_results


def main():
    params = {}
    if len(sys.argv) > 1:
        try:
            params = json.loads(sys.argv[1])
        except:
            # 单个 issue ID
            try:
                params = {"issue": int(sys.argv[1])}
            except:
                pass

    iterations = int(params.get("iterations", 100))
    issue_id = params.get("issue", None)

    if issue_id:
        result = run_issue_cases(int(issue_id), iterations=iterations)
        all_results = {int(issue_id): result}
    else:
        all_results = run_all(iterations=iterations)

    # Output JSON
    output = {
        "benchmark_name": "test_cases_87_91",
        "timestamp": datetime.now().isoformat(),
        "config": {"iterations": iterations, "issue_filter": issue_id},
        "issues": {}
    }
    for iid, data in all_results.items():
        output["issues"][str(iid)] = data

    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
