package com.lab.result;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统一处理各种格式的 metrics 数据，输出标准化结构。
 *
 * 解决的问题：
 * 1. 嵌套 JSON 路径不一致 → 统一提取
 * 2. 字段名 snake_case/camelCase 混用 → 统一
 * 3. 有延迟没吞吐 → 标记 PARTIAL
 * 4. 完全没有数据 → 标记 NO_DATA
 *
 * Issue: #514
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MetricsNormalizer {

    private final ObjectMapper objectMapper;

    /** Latency field names in priority order */
    private static final String[] LATENCY_KEYS = {
        "latency_ms_mean", "latency_mean", "latencyMean", "avg_latency_ms", "latency_ms_p50"
    };

    /** Throughput field names in priority order */
    private static final String[] THROUGHPUT_KEYS = {
        "throughput_ops", "throughput_qps", "throughput", "throughput_fps"
    };

    /** Memory field names in priority order */
    private static final String[] MEMORY_KEYS = {
        "memory_mb", "memory_usage_mb", "memoryMb"
    };

    /**
     * Normalize raw metrics JSON into a standardized structure.
     *
     * @param rawData raw JSON string (may be deeply nested)
     * @return Map with keys: latencyMsMean, throughputOps, memoryMb, dataStatus, rawMetrics
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> normalize(String rawData) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("latencyMsMean", 0.0);
        result.put("throughputOps", 0.0);
        result.put("memoryMb", 0.0);
        result.put("dataStatus", "NO_DATA");
        result.put("rawMetrics", new LinkedHashMap<>());

        if (rawData == null || rawData.isBlank()) {
            return result;
        }

        try {
            Map<String, Object> data = objectMapper.readValue(rawData, new TypeReference<>() {});

            // Flatten: merge fields from multiple paths into a single flat map
            Map<String, Object> flat = new LinkedHashMap<>();

            // Path 1: top-level numeric fields
            for (Map.Entry<String, Object> e : data.entrySet()) {
                if (e.getValue() instanceof Number || e.getValue() instanceof String) {
                    flat.put(e.getKey(), e.getValue());
                }
            }

            // Path 2: result.eval_result.summary
            Object resultObj = data.get("result");
            if (resultObj instanceof Map) {
                Map<String, Object> resultMap = (Map<String, Object>) resultObj;
                Object evalResult = resultMap.get("eval_result");
                if (evalResult instanceof Map) {
                    Map<String, Object> eval = (Map<String, Object>) evalResult;

                    Object summary = eval.get("summary");
                    if (summary instanceof Map) {
                        Map<String, Object> summaryMap = (Map<String, Object>) summary;
                        for (Map.Entry<String, Object> e : summaryMap.entrySet()) {
                            flat.putIfAbsent(e.getKey(), e.getValue());
                        }
                    }

                    // Path 3: result.eval_result.results[0] (higher priority for specific fields)
                    Object results = eval.get("results");
                    if (results instanceof List) {
                        List<Object> resultList = (List<Object>) results;
                        if (!resultList.isEmpty() && resultList.get(0) instanceof Map) {
                            Map<String, Object> first = (Map<String, Object>) resultList.get(0);
                            // results[0] fields override summary for latency/throughput
                            for (Map.Entry<String, Object> e : first.entrySet()) {
                                if (e.getValue() instanceof Number) {
                                    flat.put(e.getKey(), e.getValue());
                                }
                            }
                        }
                    }
                }
            }

            result.put("rawMetrics", flat);

            // Extract latency (priority order)
            double latency = extractFirst(flat, LATENCY_KEYS);
            result.put("latencyMsMean", latency);

            // Extract throughput (priority order)
            double throughput = extractFirst(flat, THROUGHPUT_KEYS);
            result.put("throughputOps", throughput);

            // Extract memory
            double memory = extractFirst(flat, MEMORY_KEYS);
            result.put("memoryMb", memory);

            // Determine dataStatus
            String dataStatus;
            if (latency > 0 && throughput > 0) {
                dataStatus = "VALID";
            } else if (latency > 0 || throughput > 0) {
                dataStatus = "PARTIAL";
            } else {
                dataStatus = "NO_DATA";
            }
            result.put("dataStatus", dataStatus);

        } catch (Exception e) {
            log.warn("#514: Failed to normalize metrics: {}", e.getMessage());
        }

        return result;
    }

    /**
     * Extract the first available positive numeric value from the map using the given keys.
     */
    private double extractFirst(Map<String, Object> map, String[] keys) {
        for (String key : keys) {
            Object val = map.get(key);
            if (val instanceof Number) {
                double d = ((Number) val).doubleValue();
                if (d > 0) return d;
            }
        }
        return 0.0;
    }
}
