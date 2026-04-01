#!/usr/bin/env python3
"""CPU模型推理基准测试"""
import json, time, sys, os, platform
import numpy as np
from datetime import datetime
try:
    import onnxruntime as ort; HAS_ORT = True
except: HAS_ORT = False
try:
    import psutil; HAS_PSUTIL = True
except: HAS_PSUTIL = False

def get_system_info():
    info = {"cpu": platform.processor() or platform.machine(), "arch": platform.machine(),
            "os": f"{platform.system()} {platform.release()}", "python": platform.python_version(), "numpy": np.__version__}
    if HAS_ORT: info["onnxruntime"] = ort.__version__
    if HAS_PSUTIL: info["cores_physical"] = psutil.cpu_count(logical=False); info["cores_logical"] = psutil.cpu_count(logical=True); info["memory_gb"] = round(psutil.virtual_memory().total/1e9,1)
    return info

def create_onnx_model(path, in_sz, hid_sz, out_sz):
    try:
        import onnx
        from onnx import helper, TensorProto, numpy_helper
        W1 = numpy_helper.from_array(np.random.randn(in_sz,hid_sz).astype(np.float32)*0.01, "W1")
        B1 = numpy_helper.from_array(np.zeros(hid_sz).astype(np.float32), "B1")
        W2 = numpy_helper.from_array(np.random.randn(hid_sz,out_sz).astype(np.float32)*0.01, "W2")
        B2 = numpy_helper.from_array(np.zeros(out_sz).astype(np.float32), "B2")
        X = helper.make_tensor_value_info("X", TensorProto.FLOAT, [None, in_sz])
        Y = helper.make_tensor_value_info("Y", TensorProto.FLOAT, [None, out_sz])
        graph = helper.make_graph([
            helper.make_node("MatMul",["X","W1"],["mm1"]), helper.make_node("Add",["mm1","B1"],["h1"]),
            helper.make_node("Relu",["h1"],["h1r"]), helper.make_node("MatMul",["h1r","W2"],["mm2"]),
            helper.make_node("Add",["mm2","B2"],["lo"]), helper.make_node("Softmax",["lo"],["Y"],axis=1)
        ], "mlp", [X], [Y], [W1,B1,W2,B2])
        model = helper.make_model(graph, opset_imports=[helper.make_opsetid("",13)])
        onnx.save(model, path)
        return True
    except: return False

def numpy_mlp(x, W):
    h = np.maximum(x @ W["W1"] + W["B1"], 0)
    lo = h @ W["W2"] + W["B2"]
    e = np.exp(lo - np.max(lo, axis=-1, keepdims=True))
    return e / np.sum(e, axis=-1, keepdims=True)

def bench(run_fn, inp, warmup=10, iters=100):
    for _ in range(warmup): run_fn(inp)
    lats = []
    mem0 = psutil.virtual_memory().used/1e6 if HAS_PSUTIL else 0
    cs = time.process_time(); ws = time.perf_counter()
    for _ in range(iters):
        t0 = time.perf_counter(); run_fn(inp); lats.append((time.perf_counter()-t0)*1000)
    we = time.perf_counter()-ws; ce = time.process_time()-cs
    mem1 = psutil.virtual_memory().used/1e6 if HAS_PSUTIL else 0
    return {"latency_ms_mean":round(np.mean(lats),3),"latency_ms_p50":round(np.percentile(lats,50),3),
            "latency_ms_p95":round(np.percentile(lats,95),3),"latency_ms_p99":round(np.percentile(lats,99),3),
            "latency_ms_min":round(np.min(lats),3),"latency_ms_max":round(np.max(lats),3),
            "throughput_qps":round(iters/we,1),"cpu_util_percent":round(ce/we*100,1),
            "memory_delta_mb":round(mem1-mem0,1),"total_time_sec":round(we,3)}

def main():
    params = {}
    if len(sys.argv)>1:
        try: params = json.loads(sys.argv[1])
        except: pass
    iterations = int(params.get("iterations", 100))
    batch_sizes = params.get("batch_sizes", [1, 4, 16, 32])
    
    assets_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "models")
    os.makedirs(assets_dir, exist_ok=True)
    
    configs = [
        {"name":"MLP-Small","in":784,"hid":128,"out":10,"desc":"小型MLP(MNIST分类)"},
        {"name":"MLP-Medium","in":784,"hid":512,"out":10,"desc":"中型MLP(MNIST分类)"},
        {"name":"MLP-Large","in":1024,"hid":1024,"out":100,"desc":"大型MLP(通用分类)"},
    ]
    results = []
    for cfg in configs:
        mp = os.path.join(assets_dir, cfg["name"].lower().replace("-","_")+".onnx")
        use_ort = False
        sess = None
        if create_onnx_model(mp, cfg["in"], cfg["hid"], cfg["out"]) and HAS_ORT:
            try:
                sess = ort.InferenceSession(mp, providers=["CPUExecutionProvider"])
                use_ort = True
            except: pass
        W = {"W1":np.random.randn(cfg["in"],cfg["hid"]).astype(np.float32)*0.01,
             "B1":np.zeros(cfg["hid"]).astype(np.float32),
             "W2":np.random.randn(cfg["hid"],cfg["out"]).astype(np.float32)*0.01,
             "B2":np.zeros(cfg["out"]).astype(np.float32)}
        for bs in batch_sizes:
            inp = np.random.randn(bs, cfg["in"]).astype(np.float32)
            if use_ort:
                iname = sess.get_inputs()[0].name
                fn = lambda x, s=sess, n=iname: s.run(None, {n: x})
                backend = "ONNXRuntime-CPU"
            else:
                fn = lambda x, w=W: numpy_mlp(x, w)
                backend = "NumPy"
            perf = bench(fn, inp, iters=iterations)
            out = fn(inp)
            probs = out[0] if isinstance(out, list) else out
            ok = bool(np.allclose(np.sum(probs,axis=-1),1.0,atol=1e-4)) and bool(np.all(probs>=0))
            results.append({
                "model":cfg["name"],"description":cfg["desc"],"backend":backend,"batch_size":bs,
                "input_shape":f"[{bs},{cfg[in]}]","output_shape":f"[{bs},{cfg[out]}]",
                "model_params":cfg["in"]*cfg["hid"]+cfg["hid"]+cfg["hid"]*cfg["out"]+cfg["out"],
                **perf,"accuracy_checks":{"softmax_valid":ok},"status":"PASS" if ok else "FAIL"
            })
    
    pc = sum(1 for r in results if r["status"]=="PASS")
    al = np.mean([r["latency_ms_mean"] for r in results])
    aq = np.mean([r["throughput_qps"] for r in results])
    output = {
        "benchmark_name":"cpu_model_inference","benchmark_version":"1.0",
        "timestamp":datetime.now().isoformat(),"system_info":get_system_info(),
        "config":{"iterations":iterations,"batch_sizes":batch_sizes},"results":results,
        "summary":{"total_tests":len(results),"passed":pc,"failed":len(results)-pc,
                    "pass_rate":round(pc/len(results)*100,1),"avg_latency_ms":round(al,3),"avg_throughput_qps":round(aq,1)},
        "conclusion":f"共测试{len(results)}项推理，{pc}项通过。平均延迟{al:.2f}ms，平均吞吐{aq:.0f}QPS。"
    }
    print(json.dumps(output, ensure_ascii=False))

if __name__ == "__main__":
    main()
