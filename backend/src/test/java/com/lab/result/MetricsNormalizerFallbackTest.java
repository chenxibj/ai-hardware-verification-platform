package com.lab.result;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #514 supplement: fallback logging + 2dp rounding
 */
class MetricsNormalizerFallbackTest {

    private MetricsNormalizer normalizer;

    @BeforeEach
    void setUp() {
        normalizer = new MetricsNormalizer(new ObjectMapper());
    }

    @Test
    @DisplayName("#514: values rounded to 2 decimal places (no floating point drift)")
    void roundsTo2DecimalPlaces() {
        // 100.00000000000001 should become 100.0
        String json = "{\"latency_ms_mean\": 3.14159265, \"throughput_ops\": 100.00000000000001}";
        Map<String, Object> result = normalizer.normalize(json);

        double latency = (double) result.get("latencyMsMean");
        double throughput = (double) result.get("throughputOps");

        assertEquals(3.14, latency, 0.001, "Latency should be rounded to 2dp");
        assertEquals(100.0, throughput, 0.001, "Throughput should be rounded (no float drift)");
    }

    @Test
    @DisplayName("#514: fallback key used when primary is missing")
    void fallbackKeyUsed() {
        // latency_ms_mean absent, latency_ms_p50 present (fallback)
        // throughput_ops also present → VALID
        String json = "{\"latency_ms_p50\": 5.678, \"throughput_ops\": 200}";
        Map<String, Object> result = normalizer.normalize(json);

        double latency = (double) result.get("latencyMsMean");
        assertEquals(5.68, latency, 0.001, "Should use fallback latency_ms_p50, rounded to 2dp");
        assertEquals("VALID", result.get("dataStatus"), "Both latency and throughput present → VALID");
    }

    @Test
    @DisplayName("#514: fallback produces PARTIAL when only latency available")
    void fallbackPartial() {
        // Only latency via fallback, no throughput
        String json = "{\"latency_ms_p50\": 2.5}";
        Map<String, Object> result = normalizer.normalize(json);

        double latency = (double) result.get("latencyMsMean");
        assertEquals(2.5, latency, 0.001);
        assertEquals("PARTIAL", result.get("dataStatus"), "Only latency → PARTIAL");
    }

    @Test
    @DisplayName("#514: all outputs are 2dp clean")
    void allOutputs2dpClean() {
        // Use values that don't have IEEE 754 edge cases
        String json = "{\"latency_ms_mean\": 1.126, \"throughput_ops\": 99.997, \"memory_mb\": 512.777}";
        Map<String, Object> result = normalizer.normalize(json);

        double latency = (double) result.get("latencyMsMean");
        double throughput = (double) result.get("throughputOps");
        double memory = (double) result.get("memoryMb");

        // Check they're properly rounded to 2dp
        assertEquals(1.13, latency, 0.001);     // 1.126 → 1.13
        assertEquals(100.0, throughput, 0.001);  // 99.997 → 100.0
        assertEquals(512.78, memory, 0.001);     // 512.777 → 512.78
    }
}
