package com.lab.dimension;

import java.util.*;
import java.util.stream.Collectors;

/**
 * #459: Single Source of Truth for dimension definitions.
 * All dimension naming, mapping, and metadata lives here.
 */
public class DimensionRegistry {

    public record DimensionDef(
        String key,           // "compute"
        String label,         // "计算"
        String primaryMetric, // "latencyMean"
        String direction,     // "lower_better" | "higher_better"
        List<String> operators
    ) {}

    public static final List<DimensionDef> DIMENSIONS = List.of(
        new DimensionDef("compute", "计算", "latencyMean", "lower_better",
            List.of("MatMul", "Conv2D", "GEMM", "Linear")),
        new DimensionDef("memory", "访存", "latencyMean", "lower_better",
            List.of("Transpose", "Embedding", "Concat", "Gather", "Scatter", "Memcpy", "Bandwidth")),
        new DimensionDef("communication", "通信", "busBandwidth", "higher_better",
            List.of("AllReduce", "AllGather", "NCCL", "P2P", "Broadcast", "ReduceScatter")),
        new DimensionDef("op_compat", "算子兼容", "latencyMean", "lower_better",
            List.of("ReLU", "GELU", "SiLU", "Sigmoid", "Tanh", "Softmax", "LayerNorm", "BatchNorm", "RMSNorm", "Add", "Mul")),
        new DimensionDef("training", "训练", "throughput", "higher_better",
            List.of("Backward", "Gradient", "Optimizer", "Adam", "SGD", "MixedPrecision")),
        new DimensionDef("inference", "推理", "latencyMean", "lower_better",
            List.of("Attention", "ScaledDotProduct", "MLP", "MLP-Small", "MLP-Medium", "MLP-Large", "ResNet", "BERT", "LLaMA")),
        new DimensionDef("scalability", "扩展性", "scalingEfficiency", "higher_better",
            List.of("Multi-GPU", "Scaling")),
        new DimensionDef("ecosystem", "生态", "passRate", "higher_better",
            List.of("Framework", "CUDA", "Driver"))
    );

    // operator -> dimKey cache (built at class load time)
    private static final Map<String, String> OP_TO_KEY = new HashMap<>();
    static {
        for (DimensionDef d : DIMENSIONS) {
            for (String op : d.operators()) {
                OP_TO_KEY.put(op, d.key());
            }
        }
    }

    // key -> DimensionDef cache
    private static final Map<String, DimensionDef> KEY_TO_DEF = DIMENSIONS.stream()
        .collect(Collectors.toMap(DimensionDef::key, d -> d));

    // label -> key cache (including legacy Chinese names)
    private static final Map<String, String> LABEL_TO_KEY = new HashMap<>();
    static {
        for (DimensionDef d : DIMENSIONS) {
            LABEL_TO_KEY.put(d.label(), d.key());
        }
        // Legacy six-dimension Chinese names
        LABEL_TO_KEY.put("计算性能", "compute");
        LABEL_TO_KEY.put("访存性能", "memory");
        LABEL_TO_KEY.put("数学函数", "op_compat");
        LABEL_TO_KEY.put("Attention能力", "inference");
        LABEL_TO_KEY.put("归一化性能", "op_compat");
        LABEL_TO_KEY.put("模型推理", "inference");
        LABEL_TO_KEY.put("其他", "op_compat");
    }

    /** Get English dimKey by testItem, with prefix and fuzzy matching */
    public static String getKeyByOperator(String testItem) {
        if (testItem == null) return "compute";
        // Exact match
        String key = OP_TO_KEY.get(testItem);
        if (key != null) return key;
        // Prefix match (e.g. "MLP-Medium/batch=1" -> "MLP-Medium" -> inference)
        for (Map.Entry<String, String> e : OP_TO_KEY.entrySet()) {
            if (testItem.startsWith(e.getKey())) return e.getValue();
        }
        // Fuzzy match
        String lower = testItem.toLowerCase();
        if (lower.contains("mlp") || lower.contains("resnet") || lower.contains("bert") || lower.contains("llama") || lower.contains("model") || lower.contains("inference")) return "inference";
        if (lower.contains("allreduce") || lower.contains("nccl") || lower.contains("p2p") || lower.contains("broadcast")) return "communication";
        if (lower.contains("backward") || lower.contains("gradient") || lower.contains("optimizer") || lower.contains("train")) return "training";
        return "compute";
    }

    /** Normalize Chinese/English dimension name to English key */
    public static String normalizeKey(String dimNameOrKey) {
        if (dimNameOrKey == null) return "compute";
        if (KEY_TO_DEF.containsKey(dimNameOrKey)) return dimNameOrKey; // Already English key
        String fromLabel = LABEL_TO_KEY.get(dimNameOrKey);
        return fromLabel != null ? fromLabel : "compute";
    }

    public static String getLabelByKey(String key) {
        DimensionDef d = KEY_TO_DEF.get(key);
        return d != null ? d.label() : key;
    }

    public static String getDirectionByKey(String key) {
        DimensionDef d = KEY_TO_DEF.get(key);
        return d != null ? d.direction() : "lower_better";
    }

    public static String getPrimaryMetricByKey(String key) {
        DimensionDef d = KEY_TO_DEF.get(key);
        return d != null ? d.primaryMetric() : "latencyMean";
    }

    public static List<String> allKeys() {
        return DIMENSIONS.stream().map(DimensionDef::key).collect(Collectors.toList());
    }

    public static List<String> allLabels() {
        return DIMENSIONS.stream().map(DimensionDef::label).collect(Collectors.toList());
    }

    public static DimensionDef getByKey(String key) {
        return KEY_TO_DEF.get(key);
    }
}
