package com.lab.result;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for MetricsNormalizer DataStatus determination.
 * Issue: #526
 */
class MetricsNormalizerTest {

    private MetricsNormalizer normalizer;

    @BeforeEach
    void setUp() {
        normalizer = new MetricsNormalizer(new ObjectMapper());
    }

    // ========== DataStatus determination tests ==========

    @Nested
    @DisplayName("DataStatus: NO_DATA scenarios")
    class NoDataTests {

        @Test
        @DisplayName("null rawData → NO_DATA")
        void nullInput() {
            Map<String, Object> result = normalizer.normalize(null);
            assertThat(result.get("dataStatus")).isEqualTo("NO_DATA");
            assertThat(result.get("latencyMsMean")).isEqualTo(0.0);
            assertThat(result.get("throughputOps")).isEqualTo(0.0);
        }

        @Test
        @DisplayName("empty string → NO_DATA")
        void emptyString() {
            Map<String, Object> result = normalizer.normalize("");
            assertThat(result.get("dataStatus")).isEqualTo("NO_DATA");
        }

        @Test
        @DisplayName("blank string → NO_DATA")
        void blankString() {
            Map<String, Object> result = normalizer.normalize("   ");
            assertThat(result.get("dataStatus")).isEqualTo("NO_DATA");
        }

        @Test
        @DisplayName("empty JSON object → NO_DATA")
        void emptyJson() {
            Map<String, Object> result = normalizer.normalize("{}");
            assertThat(result.get("dataStatus")).isEqualTo("NO_DATA");
        }

        @Test
        @DisplayName("JSON with only non-metric fields → NO_DATA")
        void nonMetricFields() {
            Map<String, Object> result = normalizer.normalize(
                "{\"status\": \"COMPLETED\", \"name\": \"test\"}");
            assertThat(result.get("dataStatus")).isEqualTo("NO_DATA");
        }

        @Test
        @DisplayName("latency=0 and throughput=0 → NO_DATA")
        void zeroLatencyAndThroughput() {
            Map<String, Object> result = normalizer.normalize(
                "{\"latency_ms_mean\": 0, \"throughput_ops\": 0}");
            assertThat(result.get("dataStatus")).isEqualTo("NO_DATA");
        }

        @Test
        @DisplayName("#526: MLP model inference with multiple results → NO_DATA")
        void mlpMultipleResults_noData() {
            // MLP model benchmark returns 4 batch sizes in results[].
            // Each has latency_ms_mean per batch, but these are sub-item metrics,
            // NOT the task-level metric. Task should be NO_DATA.
            String rawData = """
                {
                  "result": {
                    "eval_result": {
                      "summary": {
                        "device": "cuda",
                        "failed": 0,
                        "passed": 4,
                        "avg_latency_ms": 0.016,
                        "avg_throughput_qps": 112.1
                      },
                      "results": [
                        {"model": "MLP-Medium", "batch_size": 1, "latency_ms_mean": 0.012, "throughput_qps": 112.2},
                        {"model": "MLP-Medium", "batch_size": 4, "latency_ms_mean": 0.013, "throughput_qps": 112.1},
                        {"model": "MLP-Medium", "batch_size": 16, "latency_ms_mean": 0.017, "throughput_qps": 112.1},
                        {"model": "MLP-Medium", "batch_size": 32, "latency_ms_mean": 0.023, "throughput_qps": 112.0}
                      ]
                    }
                  },
                  "status": "COMPLETED"
                }""";
            Map<String, Object> result = normalizer.normalize(rawData);
            assertThat(result.get("dataStatus")).isEqualTo("NO_DATA");
            assertThat((double) result.get("latencyMsMean")).isEqualTo(0.0);
            assertThat((double) result.get("throughputOps")).isEqualTo(0.0);
        }

        @Test
        @DisplayName("JSON with only score field (no latency/throughput) → NO_DATA")
        void scoreOnlyNoLatency() {
            Map<String, Object> result = normalizer.normalize(
                "{\"score\": 50.0, \"eval_type\": \"MODEL\"}");
            assertThat(result.get("dataStatus")).isEqualTo("NO_DATA");
        }
    }

    @Nested
    @DisplayName("DataStatus: VALID scenarios")
    class ValidTests {

        @Test
        @DisplayName("latency>0 AND throughput>0 → VALID")
        void validLatencyAndThroughput() {
            Map<String, Object> result = normalizer.normalize(
                "{\"latency_ms_mean\": 1.5, \"throughput_ops\": 500.0}");
            assertThat(result.get("dataStatus")).isEqualTo("VALID");
            assertThat((double) result.get("latencyMsMean")).isEqualTo(1.5);
            assertThat((double) result.get("throughputOps")).isEqualTo(500.0);
        }

        @Test
        @DisplayName("Single-result operator benchmark → VALID")
        void singleResultOperator_valid() {
            // Single operator result — results[0] IS the task-level metric
            String rawData = """
                {
                  "result": {
                    "eval_result": {
                      "summary": {
                        "avg_latency_ms": 0.022,
                        "total_operators": 1
                      },
                      "results": [
                        {"operator": "MatMul", "latency_ms_mean": 0.022, "throughput_ops": 5000.0, "memory_peak_mb": 512}
                      ]
                    }
                  },
                  "status": "COMPLETED"
                }""";
            Map<String, Object> result = normalizer.normalize(rawData);
            assertThat(result.get("dataStatus")).isEqualTo("VALID");
            assertThat((double) result.get("latencyMsMean")).isEqualTo(0.02);
            assertThat((double) result.get("throughputOps")).isEqualTo(5000.0);
        }

        @Test
        @DisplayName("Nested metrics at result.eval_result.results[0] (single) → VALID")
        void nestedSingleResult() {
            String rawData = """
                {
                  "result": {
                    "eval_result": {
                      "summary": {"device": "cuda"},
                      "results": [
                        {"operator": "ReLU", "latency_ms_mean": 0.012, "throughput_ops": 29975.4}
                      ]
                    }
                  }
                }""";
            Map<String, Object> result = normalizer.normalize(rawData);
            assertThat(result.get("dataStatus")).isEqualTo("VALID");
            assertThat((double) result.get("latencyMsMean")).isEqualTo(0.01);
            assertThat((double) result.get("throughputOps")).isEqualTo(29975.4);
        }

        @Test
        @DisplayName("camelCase field names → VALID")
        void camelCaseFields() {
            Map<String, Object> result = normalizer.normalize(
                "{\"latencyMean\": 2.5, \"throughput\": 1000.0}");
            assertThat(result.get("dataStatus")).isEqualTo("VALID");
        }

        @Test
        @DisplayName("latency_ms_p50 as latency fallback → VALID")
        void latencyP50Fallback() {
            Map<String, Object> result = normalizer.normalize(
                "{\"latency_ms_p50\": 3.0, \"throughput_fps\": 200.0}");
            assertThat(result.get("dataStatus")).isEqualTo("VALID");
        }
    }

    @Nested
    @DisplayName("DataStatus: PARTIAL scenarios")
    class PartialTests {

        @Test
        @DisplayName("latency>0 but throughput=0 → PARTIAL")
        void latencyOnlyPartial() {
            Map<String, Object> result = normalizer.normalize(
                "{\"latency_ms_mean\": 1.5, \"throughput_ops\": 0}");
            assertThat(result.get("dataStatus")).isEqualTo("PARTIAL");
            assertThat((double) result.get("latencyMsMean")).isEqualTo(1.5);
            assertThat((double) result.get("throughputOps")).isEqualTo(0.0);
        }

        @Test
        @DisplayName("throughput>0 but latency=0 → PARTIAL")
        void throughputOnlyPartial() {
            Map<String, Object> result = normalizer.normalize(
                "{\"throughput_ops\": 500.0}");
            assertThat(result.get("dataStatus")).isEqualTo("PARTIAL");
            assertThat((double) result.get("latencyMsMean")).isEqualTo(0.0);
            assertThat((double) result.get("throughputOps")).isEqualTo(500.0);
        }
    }

    // ========== Edge cases ==========

    @Nested
    @DisplayName("Edge cases")
    class EdgeCases {

        @Test
        @DisplayName("Invalid JSON → NO_DATA (no exception)")
        void invalidJson() {
            Map<String, Object> result = normalizer.normalize("not json");
            assertThat(result.get("dataStatus")).isEqualTo("NO_DATA");
        }

        @Test
        @DisplayName("Negative latency → NO_DATA")
        void negativeLatency() {
            Map<String, Object> result = normalizer.normalize(
                "{\"latency_ms_mean\": -1.0, \"throughput_ops\": 500.0}");
            assertThat(result.get("dataStatus")).isEqualTo("PARTIAL");
        }

        @Test
        @DisplayName("Memory extraction works")
        void memoryExtraction() {
            Map<String, Object> result = normalizer.normalize(
                "{\"latency_ms_mean\": 1.0, \"throughput_ops\": 100.0, \"memory_peak_mb\": 1024}");
            assertThat(result.get("dataStatus")).isEqualTo("VALID");
            assertThat((double) result.get("memoryMb")).isEqualTo(1024.0);
        }

        @Test
        @DisplayName("#526: avg_latency_ms alone should NOT trigger VALID")
        void avgLatencyAloneShouldNotBeValid() {
            // avg_latency_ms is an aggregate summary field.
            // It should not be used to determine VALID status.
            Map<String, Object> result = normalizer.normalize(
                "{\"avg_latency_ms\": 0.016, \"avg_throughput_qps\": 112.1}");
            assertThat(result.get("dataStatus")).isEqualTo("NO_DATA");
        }

        @Test
        @DisplayName("results array empty → use summary only")
        void emptyResults() {
            String rawData = """
                {
                  "result": {
                    "eval_result": {
                      "summary": {"latency_ms_mean": 5.0, "throughput_ops": 200.0},
                      "results": []
                    }
                  }
                }""";
            Map<String, Object> result = normalizer.normalize(rawData);
            assertThat(result.get("dataStatus")).isEqualTo("VALID");
        }
    }
}
