package com.lab.result;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #514: MetricsNormalizer — unified data normalization layer
 */
class MetricsNormalizerTest {

    private MetricsNormalizer normalizer;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        normalizer = new MetricsNormalizer(objectMapper);
    }

    // === Path extraction tests ===

    @Test
    @DisplayName("#514: extract from result.eval_result.summary path")
    void normalize_summaryPath() {
        String raw = """
            {
                "status": "COMPLETED",
                "result": {
                    "eval_result": {
                        "summary": {
                            "avg_latency_ms": 1.5,
                            "throughput_ops": 500
                        }
                    }
                }
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(1.5, ((Number) result.get("latencyMsMean")).doubleValue(), 0.001);
        assertEquals(500.0, ((Number) result.get("throughputOps")).doubleValue(), 0.001);
        assertEquals("VALID", result.get("dataStatus"));
    }

    @Test
    @DisplayName("#514: extract from result.eval_result.results[0] path")
    void normalize_results0Path() {
        String raw = """
            {
                "result": {
                    "eval_result": {
                        "results": [{
                            "latency_ms_mean": 2.3,
                            "throughput_qps": 300,
                            "memory_mb": 1024
                        }]
                    }
                }
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(2.3, ((Number) result.get("latencyMsMean")).doubleValue(), 0.001);
        assertEquals(300.0, ((Number) result.get("throughputOps")).doubleValue(), 0.001);
        assertEquals(1024.0, ((Number) result.get("memoryMb")).doubleValue(), 0.001);
        assertEquals("VALID", result.get("dataStatus"));
    }

    @Test
    @DisplayName("#514: extract from top-level path")
    void normalize_topLevelPath() {
        String raw = """
            {
                "latency_ms_mean": 0.5,
                "throughput": 1000
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(0.5, ((Number) result.get("latencyMsMean")).doubleValue(), 0.001);
        assertEquals(1000.0, ((Number) result.get("throughputOps")).doubleValue(), 0.001);
        assertEquals("VALID", result.get("dataStatus"));
    }

    // === Latency field priority tests ===

    @Test
    @DisplayName("#514: latency_ms_mean has highest priority")
    void normalize_latencyPriority_msMean() {
        String raw = """
            {
                "latency_ms_mean": 1.0,
                "latency_mean": 2.0,
                "latencyMean": 3.0,
                "avg_latency_ms": 4.0,
                "latency_ms_p50": 5.0
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(1.0, ((Number) result.get("latencyMsMean")).doubleValue(), 0.001);
    }

    @Test
    @DisplayName("#514: latency_mean as fallback")
    void normalize_latencyPriority_latencyMean() {
        String raw = """
            {
                "latency_mean": 2.0,
                "avg_latency_ms": 4.0
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(2.0, ((Number) result.get("latencyMsMean")).doubleValue(), 0.001);
    }

    @Test
    @DisplayName("#514: camelCase latencyMean as fallback")
    void normalize_latencyPriority_camelCase() {
        String raw = """
            {
                "latencyMean": 3.0,
                "throughput": 100
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(3.0, ((Number) result.get("latencyMsMean")).doubleValue(), 0.001);
    }

    @Test
    @DisplayName("#514: avg_latency_ms as fallback")
    void normalize_latencyPriority_avgLatencyMs() {
        String raw = """
            {
                "avg_latency_ms": 4.0,
                "throughput_ops": 200
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(4.0, ((Number) result.get("latencyMsMean")).doubleValue(), 0.001);
    }

    @Test
    @DisplayName("#514: latency_ms_p50 as last resort fallback")
    void normalize_latencyPriority_p50() {
        String raw = """
            {
                "latency_ms_p50": 5.0,
                "throughput_fps": 50
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(5.0, ((Number) result.get("latencyMsMean")).doubleValue(), 0.001);
    }

    // === Throughput field priority tests ===

    @Test
    @DisplayName("#514: throughput_ops has highest priority")
    void normalize_throughputPriority_ops() {
        String raw = """
            {
                "latency_ms_mean": 1.0,
                "throughput_ops": 100,
                "throughput_qps": 200,
                "throughput": 300,
                "throughput_fps": 400
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(100.0, ((Number) result.get("throughputOps")).doubleValue(), 0.001);
    }

    @Test
    @DisplayName("#514: throughput_qps as fallback")
    void normalize_throughputPriority_qps() {
        String raw = """
            {
                "latency_ms_mean": 1.0,
                "throughput_qps": 200,
                "throughput_fps": 400
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(200.0, ((Number) result.get("throughputOps")).doubleValue(), 0.001);
    }

    // === DataStatus tests ===

    @Test
    @DisplayName("#514: VALID when both latency>0 and throughput>0")
    void normalize_dataStatus_valid() {
        String raw = """
            { "latency_ms_mean": 1.0, "throughput_ops": 100 }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals("VALID", result.get("dataStatus"));
    }

    @Test
    @DisplayName("#514: PARTIAL when only latency>0")
    void normalize_dataStatus_partialLatencyOnly() {
        String raw = """
            { "latency_ms_mean": 1.0 }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals("PARTIAL", result.get("dataStatus"));
    }

    @Test
    @DisplayName("#514: PARTIAL when only throughput>0")
    void normalize_dataStatus_partialThroughputOnly() {
        String raw = """
            { "throughput_ops": 100 }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals("PARTIAL", result.get("dataStatus"));
    }

    @Test
    @DisplayName("#514: NO_DATA when both are 0 or missing")
    void normalize_dataStatus_noData() {
        String raw = """
            { "some_other_field": "value" }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals("NO_DATA", result.get("dataStatus"));
    }

    @Test
    @DisplayName("#514: NO_DATA for empty JSON")
    void normalize_dataStatus_emptyJson() {
        String raw = "{}";
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals("NO_DATA", result.get("dataStatus"));
    }

    @Test
    @DisplayName("#514: NO_DATA for null input")
    void normalize_dataStatus_nullInput() {
        Map<String, Object> result = normalizer.normalize(null);
        assertEquals("NO_DATA", result.get("dataStatus"));
    }

    @Test
    @DisplayName("#514: NO_DATA for invalid JSON")
    void normalize_dataStatus_invalidJson() {
        Map<String, Object> result = normalizer.normalize("not json at all");
        assertEquals("NO_DATA", result.get("dataStatus"));
    }

    // === Memory extraction ===

    @Test
    @DisplayName("#514: memory_mb extracted from various fields")
    void normalize_memoryMb() {
        String raw = """
            {
                "latency_ms_mean": 1.0,
                "throughput_ops": 100,
                "memory_mb": 2048
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(2048.0, ((Number) result.get("memoryMb")).doubleValue(), 0.001);
    }

    @Test
    @DisplayName("#514: memory_usage_mb as fallback")
    void normalize_memoryUsageMb() {
        String raw = """
            {
                "latency_ms_mean": 1.0,
                "throughput_ops": 100,
                "memory_usage_mb": 4096
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertEquals(4096.0, ((Number) result.get("memoryMb")).doubleValue(), 0.001);
    }

    // === rawMetrics preserved ===

    @Test
    @DisplayName("#514: rawMetrics preserves original flattened data")
    void normalize_rawMetrics() {
        String raw = """
            { "latency_ms_mean": 1.0, "throughput_ops": 100, "custom_field": 42 }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        assertNotNull(result.get("rawMetrics"));
        @SuppressWarnings("unchecked")
        Map<String, Object> rawMetrics = (Map<String, Object>) result.get("rawMetrics");
        assertTrue(rawMetrics.containsKey("custom_field"));
    }

    // === Deep nested path with summary+results[0] merge ===

    @Test
    @DisplayName("#514: merges summary and results[0] (results[0] has priority for latency)")
    void normalize_mergedPaths() {
        String raw = """
            {
                "result": {
                    "eval_result": {
                        "summary": {
                            "avg_latency_ms": 10.0,
                            "throughput_ops": 500
                        },
                        "results": [{
                            "latency_ms_mean": 2.0
                        }]
                    }
                }
            }
            """;
        Map<String, Object> result = normalizer.normalize(raw);
        // latency_ms_mean from results[0] has higher priority than avg_latency_ms from summary
        assertEquals(2.0, ((Number) result.get("latencyMsMean")).doubleValue(), 0.001);
        assertEquals(500.0, ((Number) result.get("throughputOps")).doubleValue(), 0.001);
    }
}
