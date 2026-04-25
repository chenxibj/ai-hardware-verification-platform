package com.lab.chipreport;

import com.lab.dimension.DimensionRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 报告洞察构建器 — 瓶颈分析、场景推荐、雷达图、分类摘要
 * 从 ReportGeneratorService 拆分 (#543)
 */
@Slf4j
@Component
public class ReportInsightBuilder {

    /* #435: 八维度详细说明 */
    static final Map<String, Map<String, Object>> DIM_DETAILS = new LinkedHashMap<>();
    static {
        DIM_DETAILS.put("compute", dimDetail("计算", "衡量芯片执行核心计算操作的能力",
            "对 MatMul、Conv2D 等基础计算算子进行 benchmark",
            "vs L40S 百分比 = (L40S基准延迟 / 被测芯片延迟) × 100%",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"MatMul", "Conv2D", "GEMM", "Linear"}));
        DIM_DETAILS.put("memory", dimDetail("访存", "衡量芯片数据搬运和内存访问效率",
            "通过 Transpose、Embedding、Concat 等内存密集型操作测量", "vs L40S 百分比",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"Transpose", "Embedding", "Concat", "Gather", "Scatter"}));
        DIM_DETAILS.put("communication", dimDetail("通信", "衡量多卡/多机间通信效率，影响分布式训练和推理",
            "通过 AllReduce、AllGather、NCCL、P2P 等集合通信操作测量", "vs L40S 百分比",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"AllReduce", "AllGather", "NCCL", "P2P", "Broadcast"}));
        DIM_DETAILS.put("op_compat", dimDetail("算子兼容", "衡量芯片对常用激活/归一化/元素算子的兼容性和效率",
            "对 ReLU、Softmax、LayerNorm、BatchNorm 等进行 benchmark", "vs L40S 百分比",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"ReLU", "GeLU", "SiLU", "Softmax", "LayerNorm", "BatchNorm", "RMSNorm"}));
        DIM_DETAILS.put("training", dimDetail("训练", "衡量芯片执行模型训练的综合能力",
            "通过反向传播、梯度计算、优化器等训练相关操作测量", "vs L40S 百分比",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"Backward", "Gradient", "Optimizer", "Adam", "SGD"}));
        DIM_DETAILS.put("inference", dimDetail("推理", "衡量芯片端到端运行模型推理的综合能力",
            "通过 Attention、MLP、BERT、LLaMA 等模型推理场景测量", "vs L40S 百分比",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"Attention", "ScaledDotProduct", "MLP", "BERT", "LLaMA"}));
        DIM_DETAILS.put("scalability", dimDetail("扩展性", "衡量芯片多卡扩展时的性能线性度",
            "基于芯片 interconnect 带宽、GPU 数量、NVLink 等硬件参数计算", "基于芯片规格属性计算",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"Multi-GPU", "Scaling"}));
        DIM_DETAILS.put("ecosystem", dimDetail("生态", "衡量芯片软件生态、框架兼容性和工具链成熟度",
            "基于芯片 softwareStack、supportedPrecisions 等属性量化评分", "基于芯片规格属性计算",
            "≥100%：达到基准 | 80-99%：接近基准 | <80%：低于基准",
            new String[]{"Framework", "CUDA", "Driver"}));
    }

    private static Map<String, Object> dimDetail(String name, String description,
            String evalMethod, String scoringBasis, String scoringStandard, String[] operators) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("name", name); d.put("description", description);
        d.put("evalMethod", evalMethod); d.put("scoringBasis", scoringBasis);
        d.put("scoringStandard", scoringStandard);
        d.put("coveredOperators", Arrays.asList(operators));
        return d;
    }

    /** 构建六维雷达图数据（含维度说明） */
    public List<Map<String, Object>> buildRadarData(Map<String, Double> dimScores) {
        List<Map<String, Object>> radarData = new ArrayList<>();
        for (String key : DimensionRegistry.allKeys()) {
            String label = DimensionRegistry.getLabelByKey(key);
            double score = dimScores.getOrDefault(key, 0.0);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("dimension", label);
            item.put("dimKey", key);
            item.put("score", Math.round(score * 10.0) / 10.0);
            Map<String, Object> detail = DIM_DETAILS.get(key);
            if (detail != null) item.put("detail", detail);
            radarData.add(item);
        }
        return radarData;
    }

    /** 构建瓶颈分析 */
    public List<Map<String, Object>> buildBottleneckAnalysis(
            Map<String, Double> dimScores, List<Map<String, Object>> operatorRanking) {
        List<Map<String, Object>> analysis = new ArrayList<>();

        // 1. Worst performing operators (#470: skip score >= 85)
        List<Map<String, Object>> sorted = operatorRanking.stream()
                .filter(op -> "VALID".equals(op.get("dataStatus")))
                .filter(op -> dbl(op.get("score")) < 85.0)
                .sorted((a, b) -> Double.compare(dbl(a.get("score")), dbl(b.get("score"))))
                .collect(Collectors.toList());
        int worstCount = Math.min(3, sorted.size());
        for (int i = 0; i < worstCount; i++) {
            Map<String, Object> op = sorted.get(i);
            double score = dbl(op.get("score"));
            String level = score < 50 ? "error" : score < 70 ? "warning" : "info";
            String label = score < 70 ? "低性能算子" : "中等性能算子";
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "worst_operator");
            item.put("level", level);
            item.put("title", label + ": " + op.getOrDefault("name", op.getOrDefault("testItem", "Unknown")));
            item.put("detail", String.format("评分 %.1f，延迟 %.2fms，吞吐 %.1f ops/s", score,
                    dbl(op.getOrDefault("avgLatency", op.getOrDefault("latencyMean", 0))),
                    dbl(op.getOrDefault("throughput", 0))));
            item.put("score", Math.round(score * 10.0) / 10.0);
            item.put("operator", op.getOrDefault("name", op.getOrDefault("testItem", "Unknown")));
            analysis.add(item);
        }

        // 2. Most volatile operator (P95/Mean ratio)
        Map<String, Object> mostVolatile = null;
        double maxRatio = 0;
        for (Map<String, Object> op : operatorRanking) {
            double mean = dbl(op.getOrDefault("avgLatency", op.getOrDefault("latencyMean", 0)));
            double p95 = dbl(op.getOrDefault("p95Latency", op.getOrDefault("latencyP95", 0)));
            if (mean > 0 && p95 > 0) {
                double ratio = p95 / mean;
                if (ratio > maxRatio) { maxRatio = ratio; mostVolatile = op; }
            }
        }
        if (mostVolatile != null && maxRatio > 1.5) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "high_volatility");
            item.put("level", maxRatio > 3 ? "error" : maxRatio > 2 ? "warning" : "info");
            item.put("title", "高波动算子: " + mostVolatile.getOrDefault("name",
                    mostVolatile.getOrDefault("testItem", "Unknown")));
            item.put("detail", String.format("P95/Mean 比值 %.1fx，延迟波动较大，可能影响生产稳定性", maxRatio));
            item.put("ratio", Math.round(maxRatio * 10.0) / 10.0);
            analysis.add(item);
        }

        // 3. Weak dimension warnings (#440: skip 0.0)
        for (Map.Entry<String, Double> entry : dimScores.entrySet()) {
            if (entry.getValue() > 0 && entry.getValue() < 60) {
                String dimName = DimensionRegistry.getLabelByKey(entry.getKey());
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("type", "weak_dimension");
                item.put("level", entry.getValue() < 40 ? "error" : "warning");
                item.put("title", "薄弱维度: " + dimName);
                item.put("detail", String.format("%s 维度评分仅 %.1f，建议针对性优化", dimName, entry.getValue()));
                item.put("score", Math.round(entry.getValue() * 10.0) / 10.0);
                analysis.add(item);
            }
        }

        // 4-10: structural analyses
        addStructuralAnalyses(analysis, dimScores, operatorRanking);

        return analysis;
    }

    private void addStructuralAnalyses(List<Map<String, Object>> analysis,
            Map<String, Double> dimScores, List<Map<String, Object>> operatorRanking) {
        double trainScore = dimScores.getOrDefault("training", 0.0);
        double infScore = dimScores.getOrDefault("inference", 0.0);
        double memScore = dimScores.getOrDefault("memory", 0.0);
        double commScore = dimScores.getOrDefault("communication", 0.0);
        double scaleScore = dimScores.getOrDefault("scalability", 0.0);
        double ecoScore = dimScores.getOrDefault("ecosystem", 0.0);

        // 4. Training/inference imbalance
        if (trainScore > 0 && infScore > 0 && Math.abs(trainScore - infScore) > 30) {
            String stronger = trainScore > infScore ? "训练" : "推理";
            String weaker = trainScore > infScore ? "推理" : "训练";
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "imbalance"); item.put("level", "warning");
            item.put("title", "训练/推理不平衡");
            item.put("detail", String.format("%s(%.1f%%) 显著强于 %s(%.1f%%)，差距 %.1f%%。适合专注 %s 场景，%s 场景慎用。",
                    stronger, Math.max(trainScore, infScore), weaker, Math.min(trainScore, infScore),
                    Math.abs(trainScore - infScore), stronger, weaker));
            analysis.add(item);
        }

        // 5. Memory bandwidth bottleneck
        if (memScore > 0 && memScore < 80 && infScore > 0 && infScore < 90) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "memory_bottleneck");
            item.put("level", memScore < 60 ? "error" : "warning");
            item.put("title", "显存带宽可能是瓶颈");
            item.put("detail", String.format("访存性能 %.1f%%，推理性能 %.1f%%。建议检查显存带宽利用率，考虑量化或算子融合优化。", memScore, infScore));
            analysis.add(item);
        }

        // 6. Communication bottleneck
        if ((commScore > 0 && commScore < 50) || (scaleScore > 0 && scaleScore < 50)) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "comm_bottleneck"); item.put("level", "warning");
            item.put("title", "分布式训练风险");
            item.put("detail", String.format("通信评分 %.1f%%，扩展性 %.1f%%。多卡/多机分布式训练可能出现严重通信瓶颈，建议先单卡验证再扩展。", commScore, scaleScore));
            analysis.add(item);
        }

        // 7. Operator pass rate
        long totalValid = operatorRanking.stream().filter(op -> "VALID".equals(op.get("dataStatus"))).count();
        long totalPassed = operatorRanking.stream().filter(op -> Boolean.TRUE.equals(op.get("passed"))).count();
        if (totalValid > 0) {
            double passRate = (double) totalPassed / totalValid * 100;
            if (passRate < 90) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("type", "low_pass_rate");
                item.put("level", passRate < 70 ? "error" : "warning");
                item.put("title", String.format("算子通过率偏低: %.0f%%", passRate));
                item.put("detail", String.format("%d/%d 算子通过基准测试。未通过算子可能影响模型兼容性和部署可靠性。", totalPassed, totalValid));
                analysis.add(item);
            }
        }

        // 8. Ecosystem gap
        if (ecoScore > 0 && ecoScore < 70) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "ecosystem_gap"); item.put("level", "warning");
            item.put("title", "生态支持不足");
            item.put("detail", String.format("生态评分 %.1f%%。支持的精度类型较少或软件栈不完善，可能影响模型适配和开发效率。", ecoScore));
            analysis.add(item);
        }

        // 9. Efficiency concern
        double overallAvg = dimScores.values().stream().filter(v -> v > 0).mapToDouble(Double::doubleValue).average().orElse(0);
        if (overallAvg < 80 && overallAvg > 0) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "efficiency_concern"); item.put("level", "info");
            item.put("title", "综合性价比待评估");
            item.put("detail", String.format("有效维度均分 %.1f%%，未达到 L40S 80%% 水平。建议结合价格和功耗评估 TCO。", overallAvg));
            analysis.add(item);
        }

        // 10. Single strength
        List<Map.Entry<String, Double>> highDims = dimScores.entrySet().stream()
                .filter(e -> e.getValue() >= 120).collect(Collectors.toList());
        if (highDims.size() >= 1 && highDims.size() <= 2) {
            String dims = highDims.stream()
                    .map(e -> DimensionRegistry.getLabelByKey(e.getKey()) + "(" + String.format("%.0f%%", e.getValue()) + ")")
                    .collect(Collectors.joining("、"));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "single_strength"); item.put("level", "info");
            item.put("title", "突出优势: " + dims);
            item.put("detail", "这些维度显著超越 L40S，可作为芯片核心卖点和差异化竞争优势。");
            analysis.add(item);
        }
    }

    /** 构建场景推荐 */
    public List<Map<String, Object>> buildScenarioRecommendations(
            Map<String, Double> dimScores, double overallScore) {
        List<Map<String, Object>> recs = new ArrayList<>();
        double compute = dimScores.getOrDefault("compute", 0.0);
        double memory = dimScores.getOrDefault("memory", 0.0);
        double opCompat = dimScores.getOrDefault("op_compat", 0.0);
        double inference = dimScores.getOrDefault("inference", 0.0);

        // Recommended
        if (overallScore >= 75 && compute >= 85)
            addRec(recs, "recommended", "大规模矩阵运算",
                    String.format("计算性能突出（%.1f分），适合 HPC、科学计算等计算密集型场景", compute), Arrays.asList("计算性能"));
        if (overallScore >= 75 && inference >= 85) {
            addRec(recs, "recommended", "大语言模型推理",
                    String.format("Attention 能力优秀（%.1f分），适合 LLM 推理和 Transformer 模型部署", inference), Arrays.asList("Attention能力"));
            addRec(recs, "recommended", "模型部署服务",
                    String.format("模型推理性能优秀（%.1f分），适合生产环境模型部署", inference), Arrays.asList("模型推理"));
        }
        if (overallScore >= 75 && opCompat >= 85)
            addRec(recs, "recommended", "训练加速",
                    String.format("数学函数性能优秀（%.1f分），激活函数高效，适合模型训练", opCompat), Arrays.asList("数学函数"));
        if (overallScore >= 75 && memory >= 85)
            addRec(recs, "recommended", "大批量数据处理",
                    String.format("访存性能优秀（%.1f分），适合大规模数据预处理和 embedding 查询", memory), Arrays.asList("访存性能"));

        // Caution
        if (inference >= 60 && inference < 75)
            addRec(recs, "caution", "Transformer 模型",
                    String.format("Attention 能力中等（%.1f分），部署 Transformer 模型时需关注延迟", inference), Arrays.asList("Attention能力"));
        if (compute >= 60 && compute < 75)
            addRec(recs, "caution", "计算密集型任务",
                    String.format("计算性能中等（%.1f分），大规模矩阵运算可能成为瓶颈", compute), Arrays.asList("计算性能"));
        if (memory >= 60 && memory < 75)
            addRec(recs, "caution", "内存密集型任务",
                    String.format("访存性能中等（%.1f分），大批量 embedding 和转置操作需关注", memory), Arrays.asList("访存性能"));
        if (opCompat >= 60 && opCompat < 75)
            addRec(recs, "caution", "深层网络训练",
                    String.format("归一化性能中等（%.1f分），深层网络 LayerNorm/BatchNorm 性能需关注", opCompat), Arrays.asList("归一化性能"));

        // Unverified
        if (inference < 60) {
            addRec(recs, "unverified", "大语言模型",
                    inference > 0 ? String.format("Attention 维度评分较低（%.1f分），LLM 部署前需充分验证", inference)
                            : "缺少 Attention 维度评测数据，LLM 部署前需补充验证", Arrays.asList("Attention能力"));
            addRec(recs, "unverified", "端到端模型推理",
                    inference > 0 ? String.format("模型推理评分较低（%.1f分），生产部署前需验证", inference)
                            : "缺少模型推理评测数据，部署前需补充验证", Arrays.asList("模型推理"));
        }
        if (compute < 60)
            addRec(recs, "unverified", "高性能计算",
                    compute > 0 ? String.format("计算性能评分较低（%.1f分），HPC 场景需充分验证", compute)
                            : "缺少计算性能评测数据，HPC 场景需补充验证", Arrays.asList("计算性能"));

        return recs;
    }

    /** 构建分类摘要（训练/推理） */
    public Map<String, Object> buildCategorySummary(
            List<Map<String, Object>> operatorRanking, String dimension, double dimensionScore) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("dimension", dimension);
        summary.put("overallScore", Math.round(dimensionScore * 10.0) / 10.0);

        List<Map<String, Object>> operators = operatorRanking.stream()
                .filter(op -> dimension.equals(op.get("dimension"))).collect(Collectors.toList());
        summary.put("operatorCount", operators.size());
        summary.put("validCount", operators.stream().filter(op -> "VALID".equals(op.get("dataStatus"))).count());

        operators.stream().filter(op -> op.get("score") != null)
                .max((a, b) -> Double.compare(dbl(a.get("score")), dbl(b.get("score"))))
                .ifPresent(best -> { summary.put("bestOperator", best.get("testItem")); summary.put("bestScore", dbl(best.get("score"))); });

        // #440: Only show worstOperator if it differs from bestOperator
        operators.stream().filter(op -> op.get("score") != null && dbl(op.get("score")) > 0)
                .min((a, b) -> Double.compare(dbl(a.get("score")), dbl(b.get("score"))))
                .ifPresent(worst -> {
                    String worstName = (String) worst.get("testItem");
                    Object bestName = summary.get("bestOperator");
                    if (bestName == null || !bestName.equals(worstName)) {
                        summary.put("worstOperator", worstName);
                        summary.put("worstScore", dbl(worst.get("score")));
                    }
                });

        double avgLat = operators.stream().filter(op -> dbl(op.getOrDefault("latencyMean", 0)) > 0)
                .mapToDouble(op -> dbl(op.get("latencyMean"))).average().orElse(0);
        double avgTp = operators.stream().filter(op -> dbl(op.getOrDefault("throughput", 0)) > 0)
                .mapToDouble(op -> dbl(op.get("throughput"))).average().orElse(0);
        summary.put("avgLatencyMs", Math.round(avgLat * 1000.0) / 1000.0);
        summary.put("avgThroughput", Math.round(avgTp * 10.0) / 10.0);
        return summary;
    }

    private void addRec(List<Map<String, Object>> list, String type,
                        String scenario, String reason, List<String> dimensions) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("type", type); item.put("scenario", scenario);
        item.put("reason", reason); item.put("dimensions", dimensions);
        list.add(item);
    }

    static double dbl(Object val) {
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }
}
