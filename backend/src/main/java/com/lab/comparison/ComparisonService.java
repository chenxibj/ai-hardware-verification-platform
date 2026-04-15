package com.lab.comparison;

import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * #444: Report Comparison Service
 * Implements vs% calculation formulas for operator/dimension/overall comparison.
 * 
 * Core principle: vs% > 100% means test is better, < 100% means worse.
 * - higher_better (throughput, bandwidth, efficiency): vsPct = test / baseline * 100
 * - lower_better (latency, volatility): vsPct = baseline / test * 100
 */
@Service
public class ComparisonService {

    // ── Metric direction mapping ──

    private static final Map<String, String> METRIC_DIRECTIONS = Map.ofEntries(
        // lower_better: latency & volatility
        Map.entry("latencyMean", "lower_better"),
        Map.entry("latencyP95", "lower_better"),
        Map.entry("latencyP99", "lower_better"),
        Map.entry("latencyCV", "lower_better"),
        Map.entry("p95p50Ratio", "lower_better"),
        // higher_better: throughput, bandwidth, efficiency
        Map.entry("throughput", "higher_better"),
        Map.entry("busBandwidth", "higher_better"),
        Map.entry("memBandwidth", "higher_better"),
        Map.entry("gflops", "higher_better"),
        Map.entry("scalingEfficiency", "higher_better"),
        Map.entry("passRate", "higher_better")
    );

    // ── Dimension configuration ──

    private static final Map<String, String> DIMENSION_PRIMARY_METRICS = Map.of(
        "compute", "latencyMean",
        "memory", "latencyMean",
        "communication", "busBandwidth",
        "op_compat", "latencyMean",
        "training", "throughput",
        "inference", "latencyMean",
        "scalability", "scalingEfficiency",
        "ecosystem", "passRate"
    );

    private static final Map<String, String> DIMENSION_DIRECTIONS = Map.of(
        "compute", "lower_better",
        "memory", "lower_better",
        "communication", "higher_better",
        "op_compat", "lower_better",
        "training", "higher_better",
        "inference", "lower_better",
        "scalability", "higher_better",
        "ecosystem", "higher_better"
    );

    // ── Core formula ──

    /**
     * Calculate vs percentage for a single metric.
     *
     * @param direction "higher_better" or "lower_better"
     * @param baselineValue baseline metric value
     * @param testValue test metric value
     * @return vs percentage (>100 = test is better), or null if invalid
     */
    public static Double calcVsPct(String direction, double baselineValue, double testValue) {
        if (baselineValue <= 0 || testValue <= 0) {
            return null;
        }
        if ("lower_better".equals(direction)) {
            return (baselineValue / testValue) * 100.0;
        } else {
            // higher_better (default)
            return (testValue / baselineValue) * 100.0;
        }
    }

    // ── Metric direction lookup ──

    public static String getMetricDirection(String metricName) {
        return METRIC_DIRECTIONS.getOrDefault(metricName, "higher_better");
    }

    // ── Dimension config lookup ──

    public static String getDimensionPrimaryMetric(String dimensionKey) {
        return DIMENSION_PRIMARY_METRICS.get(dimensionKey);
    }

    public static String getDimensionDirection(String dimensionKey) {
        return DIMENSION_DIRECTIONS.get(dimensionKey);
    }

    // ── Dimension-level aggregation ──

    /**
     * Calculate the vs% for a dimension by averaging the primary metric vs% 
     * across all common operators.
     *
     * @param dimensionKey e.g. "compute", "communication"
     * @param baselineOps operators from baseline report
     * @param testOps operators from test report
     * @return average vs% or null if no valid common operators
     */
    public Double calcDimensionVsPct(String dimensionKey,
                                     List<Map<String, Object>> baselineOps,
                                     List<Map<String, Object>> testOps) {
        String primaryMetric = DIMENSION_PRIMARY_METRICS.get(dimensionKey);
        String direction = DIMENSION_DIRECTIONS.get(dimensionKey);
        if (primaryMetric == null || direction == null) {
            return null;
        }

        // Index operators by testItem
        Map<String, Map<String, Object>> baselineByItem = indexByTestItem(baselineOps);
        Map<String, Map<String, Object>> testByItem = indexByTestItem(testOps);

        // Find common operators
        Set<String> commonItems = new HashSet<>(baselineByItem.keySet());
        commonItems.retainAll(testByItem.keySet());

        if (commonItems.isEmpty()) {
            return null;
        }

        List<Double> vsPcts = new ArrayList<>();
        for (String item : commonItems) {
            Double blVal = extractDouble(baselineByItem.get(item), primaryMetric);
            Double tsVal = extractDouble(testByItem.get(item), primaryMetric);
            if (blVal == null || tsVal == null) {
                continue;
            }
            Double pct = calcVsPct(direction, blVal, tsVal);
            if (pct != null) {
                vsPcts.add(pct);
            }
        }

        if (vsPcts.isEmpty()) {
            return null;
        }

        return vsPcts.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
    }

    // ── Overall vs% ──

    /**
     * Calculate overall vs% as the average of all non-null dimension vs%.
     */
    public Double calcOverallVsPct(Map<String, Double> dimensionVsPcts) {
        List<Double> valid = dimensionVsPcts.values().stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
        if (valid.isEmpty()) {
            return null;
        }
        return valid.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
    }

    // ── Helpers ──

    private Map<String, Map<String, Object>> indexByTestItem(List<Map<String, Object>> ops) {
        Map<String, Map<String, Object>> index = new LinkedHashMap<>();
        if (ops == null) return index;
        for (Map<String, Object> op : ops) {
            Object item = op.get("testItem");
            if (item != null) {
                index.put(item.toString(), op);
            }
        }
        return index;
    }

    private Double extractDouble(Map<String, Object> op, String key) {
        if (op == null) return null;
        Object val = op.get(key);
        if (val == null) return null;
        if (val instanceof Number) {
            return ((Number) val).doubleValue();
        }
        try {
            return Double.parseDouble(val.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
