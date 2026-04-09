#!/usr/bin/env python3
"""Patch cpu_operator_benchmark.py for #235, #236, #237"""
import re

path = '/opt/ai-hardware-verification-platform/eval-scripts/cpu_operator_benchmark.py'
with open(path, 'r') as f:
    content = f.read()

# 1. Add imports for accuracy_utils at the top
content = content.replace(
    'from datetime import datetime',
    'from datetime import datetime\nimport traceback\nsys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))\ntry:\n    from accuracy_utils import compute_accuracy_metrics, judge_accuracy, get_flops_for_op, DEFAULT_THRESHOLDS\n    HAS_ACCURACY = True\nexcept ImportError:\n    HAS_ACCURACY = False'
)

# 2. Enhance benchmark_op to include GFLOPS, memory, CV, warmup overhead (#236)
old_benchmark_op = '''def benchmark_op(name, func, warmup=5, iterations=50):
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
    }'''

new_benchmark_op = '''def benchmark_op(name, func, warmup=5, iterations=50, flops=0, peak_gflops=None):
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

    return result'''

content = content.replace(old_benchmark_op, new_benchmark_op)

# 3. Update run_single_test_case to pass flops and support dtype (#235, #236, #237)
old_single_return = '''    iters = min(iterations, 20) if op_lower in ("matinverse", "svd") else iterations
    r = benchmark_op(name, func, iterations=iters)
    r["input_shape"] = shape_str
    r["description"] = desc
    return r'''

new_single_return = '''    iters = min(iterations, 20) if op_lower in ("matinverse", "svd") else iterations
    # #236: Calculate FLOPs for the operator
    flops = 0
    if HAS_ACCURACY:
        flops = get_flops_for_op(op, **test_case)
    r = benchmark_op(name, func, iterations=iters, flops=flops, peak_gflops=test_case.get("_peak_gflops"))
    r["input_shape"] = shape_str
    r["description"] = desc
    r["dtype"] = test_case.get("dtype", "FP32")
    return r'''

content = content.replace(old_single_return, new_single_return)

# 4. Add run_accuracy_test function and replace main()
# Find main() and everything after it
main_start = content.find('\ndef main():')
if main_start == -1:
    print("ERROR: Could not find main() function")
    exit(1)

content_before_main = content[:main_start]

new_main_and_accuracy = '''

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
'''

content_final = content_before_main + new_main_and_accuracy

with open(path, 'w') as f:
    f.write(content_final)

print('cpu_operator_benchmark.py patched for #235, #236, #237')
