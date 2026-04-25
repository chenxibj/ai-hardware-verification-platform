package com.lab.scoring;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Shared utilities for parsing metrics JSON (#543).
 * Extracted to avoid duplication between ScoringService and BaselineDataService.
 */
final class MetricsHelper {

    private MetricsHelper() {}

    /**
     * Navigate nested JSON to find actual metrics data.
     */
    static JsonNode findMetricsNode(JsonNode root) {
        if (root.has("latency_ms_mean") || root.has("latency_mean") || root.has("latencyMean") || root.has("avg_latency_ms")) {
            return root;
        }
        JsonNode result = root.path("result");
        if (!result.isMissingNode()) {
            JsonNode evalResult = result.path("eval_result");
            if (!evalResult.isMissingNode()) {
                JsonNode results = evalResult.path("results");
                if (results.isArray() && results.size() > 0) {
                    JsonNode first = results.get(0);
                    if (first.has("latency_ms_mean") || first.has("latency_mean")) {
                        return first;
                    }
                }
                JsonNode summary = evalResult.path("summary");
                if (!summary.isMissingNode() && (summary.has("avg_latency_ms") || summary.has("latency_ms_mean"))) {
                    return summary;
                }
            }
        }
        return root;
    }

    /**
     * Extract latency from a metrics JSON node.
     */
    static double extractLatency(JsonNode node) {
        String latKey = node.has("latency_ms_mean") ? "latency_ms_mean"
                : node.has("latency_mean") ? "latency_mean"
                : node.has("latencyMean") ? "latencyMean"
                : node.has("avg_latency_ms") ? "avg_latency_ms" : null;
        if (latKey != null && !node.get(latKey).isNull()) {
            return node.get(latKey).asDouble();
        }
        if (node.has("latencyP50") && !node.get("latencyP50").isNull()) {
            return node.get("latencyP50").asDouble();
        }
        return -1;
    }
}
