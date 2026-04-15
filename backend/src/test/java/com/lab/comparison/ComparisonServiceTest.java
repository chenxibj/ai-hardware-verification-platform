package com.lab.comparison;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #444: ComparisonService
 * Covers all 9 test cases from design doc section 7.2
 */
class ComparisonServiceTest {

    private ComparisonService service;

    @BeforeEach
    void setUp() {
        service = new ComparisonService();
    }

    // ── calcVsPct: 9 consistency test cases from design doc 7.2 ──

    @Test
    @DisplayName("延迟-被测更快: baseline=0.022, test=0.019, lower_better → 115.79")
    void calcVsPct_latency_faster() {
        Double result = ComparisonService.calcVsPct("lower_better", 0.022, 0.019);
        assertNotNull(result);
        assertEquals(115.79, round2(result), 0.01);
    }

    @Test
    @DisplayName("延迟-被测更慢: baseline=0.022, test=0.028, lower_better → 78.57")
    void calcVsPct_latency_slower() {
        Double result = ComparisonService.calcVsPct("lower_better", 0.022, 0.028);
        assertNotNull(result);
        assertEquals(78.57, round2(result), 0.01);
    }

    @Test
    @DisplayName("延迟-相同: baseline=0.022, test=0.022, lower_better → 100.00")
    void calcVsPct_latency_same() {
        Double result = ComparisonService.calcVsPct("lower_better", 0.022, 0.022);
        assertNotNull(result);
        assertEquals(100.00, round2(result), 0.01);
    }

    @Test
    @DisplayName("吞吐-被测更高: baseline=23027, test=26316, higher_better → 114.28")
    void calcVsPct_throughput_higher() {
        Double result = ComparisonService.calcVsPct("higher_better", 23027, 26316);
        assertNotNull(result);
        assertEquals(114.28, round2(result), 0.01);
    }

    @Test
    @DisplayName("吞吐-被测更低: baseline=23027, test=17857, higher_better → 77.55")
    void calcVsPct_throughput_lower() {
        Double result = ComparisonService.calcVsPct("higher_better", 23027, 17857);
        assertNotNull(result);
        assertEquals(77.55, round2(result), 0.01);
    }

    @Test
    @DisplayName("吞吐-相同: baseline=23027, test=23027, higher_better → 100.00")
    void calcVsPct_throughput_same() {
        Double result = ComparisonService.calcVsPct("higher_better", 23027, 23027);
        assertNotNull(result);
        assertEquals(100.00, round2(result), 0.01);
    }

    @Test
    @DisplayName("基准值为0: baseline=0, test=0.019, lower_better → null")
    void calcVsPct_baseline_zero() {
        Double result = ComparisonService.calcVsPct("lower_better", 0, 0.019);
        assertNull(result);
    }

    @Test
    @DisplayName("被测值为0: baseline=0.022, test=0, lower_better → null")
    void calcVsPct_test_zero() {
        Double result = ComparisonService.calcVsPct("lower_better", 0.022, 0);
        assertNull(result);
    }

    @Test
    @DisplayName("负值: baseline=-1, test=0.019, lower_better → null")
    void calcVsPct_negative() {
        Double result = ComparisonService.calcVsPct("lower_better", -1, 0.019);
        assertNull(result);
    }

    // ── Dimension vs% calculation tests ──

    @Test
    @DisplayName("维度聚合: compute维度, 两个共同算子的主指标vs%算术平均")
    void calcDimensionVsPct_compute_average() {
        // Two operators in compute dimension with latencyMean as primary metric
        // Op1: baseline=0.022, test=0.019 → vs%=115.79
        // Op2: baseline=0.018, test=0.016 → vs%=112.50
        // Average: (115.79 + 112.50) / 2 = 114.14 (approx)
        List<Map<String, Object>> baselineOps = new ArrayList<>();
        baselineOps.add(makeOp("MatMul", "计算", 0.022, 23027));
        baselineOps.add(makeOp("Conv2D", "计算", 0.018, 25000));

        List<Map<String, Object>> testOps = new ArrayList<>();
        testOps.add(makeOp("MatMul", "计算", 0.019, 26316));
        testOps.add(makeOp("Conv2D", "计算", 0.016, 28000));

        Double result = service.calcDimensionVsPct("compute", baselineOps, testOps);
        assertNotNull(result);
        // (0.022/0.019*100 + 0.018/0.016*100) / 2 = (115.789 + 112.5) / 2 = 114.14
        assertEquals(114.14, round2(result), 0.1);
    }

    @Test
    @DisplayName("维度聚合: communication维度, busBandwidth为主指标, higher_better")
    void calcDimensionVsPct_communication() {
        List<Map<String, Object>> baselineOps = new ArrayList<>();
        Map<String, Object> blOp = new HashMap<>();
        blOp.put("testItem", "AllReduce");
        blOp.put("dimension", "通信");
        blOp.put("busBandwidth", 800.0);
        blOp.put("dataStatus", "VALID");
        baselineOps.add(blOp);

        List<Map<String, Object>> testOps = new ArrayList<>();
        Map<String, Object> tsOp = new HashMap<>();
        tsOp.put("testItem", "AllReduce");
        tsOp.put("dimension", "通信");
        tsOp.put("busBandwidth", 720.0);
        tsOp.put("dataStatus", "VALID");
        testOps.add(tsOp);

        Double result = service.calcDimensionVsPct("communication", baselineOps, testOps);
        assertNotNull(result);
        // 720/800*100 = 90.0
        assertEquals(90.0, round2(result), 0.01);
    }

    @Test
    @DisplayName("维度聚合: 无共同算子 → null")
    void calcDimensionVsPct_noCommonOps() {
        List<Map<String, Object>> baselineOps = new ArrayList<>();
        baselineOps.add(makeOp("MatMul", "计算", 0.022, 23027));

        List<Map<String, Object>> testOps = new ArrayList<>();
        testOps.add(makeOp("Conv2D", "计算", 0.016, 28000));

        Double result = service.calcDimensionVsPct("compute", baselineOps, testOps);
        assertNull(result);
    }

    @Test
    @DisplayName("维度聚合: 共同算子的主指标值为0 → 跳过, 返回null")
    void calcDimensionVsPct_zeroValue() {
        List<Map<String, Object>> baselineOps = new ArrayList<>();
        baselineOps.add(makeOp("MatMul", "计算", 0.0, 0));

        List<Map<String, Object>> testOps = new ArrayList<>();
        testOps.add(makeOp("MatMul", "计算", 0.019, 26316));

        Double result = service.calcDimensionVsPct("compute", baselineOps, testOps);
        assertNull(result);
    }

    // ── Metric direction mapping tests ──

    @Test
    @DisplayName("指标方向: latencyMean → lower_better")
    void metricDirection_latency() {
        assertEquals("lower_better", ComparisonService.getMetricDirection("latencyMean"));
        assertEquals("lower_better", ComparisonService.getMetricDirection("latencyP95"));
        assertEquals("lower_better", ComparisonService.getMetricDirection("latencyP99"));
        assertEquals("lower_better", ComparisonService.getMetricDirection("latencyCV"));
        assertEquals("lower_better", ComparisonService.getMetricDirection("p95p50Ratio"));
    }

    @Test
    @DisplayName("指标方向: throughput → higher_better")
    void metricDirection_throughput() {
        assertEquals("higher_better", ComparisonService.getMetricDirection("throughput"));
        assertEquals("higher_better", ComparisonService.getMetricDirection("busBandwidth"));
        assertEquals("higher_better", ComparisonService.getMetricDirection("memBandwidth"));
        assertEquals("higher_better", ComparisonService.getMetricDirection("gflops"));
        assertEquals("higher_better", ComparisonService.getMetricDirection("scalingEfficiency"));
        assertEquals("higher_better", ComparisonService.getMetricDirection("passRate"));
    }

    // ── Dimension config tests ──

    @Test
    @DisplayName("维度配置: compute → latencyMean/lower_better")
    void dimensionConfig_compute() {
        assertEquals("latencyMean", ComparisonService.getDimensionPrimaryMetric("compute"));
        assertEquals("lower_better", ComparisonService.getDimensionDirection("compute"));
    }

    @Test
    @DisplayName("维度配置: training → throughput/higher_better")
    void dimensionConfig_training() {
        assertEquals("throughput", ComparisonService.getDimensionPrimaryMetric("training"));
        assertEquals("higher_better", ComparisonService.getDimensionDirection("training"));
    }

    @Test
    @DisplayName("维度配置: communication → busBandwidth/higher_better")
    void dimensionConfig_communication() {
        assertEquals("busBandwidth", ComparisonService.getDimensionPrimaryMetric("communication"));
        assertEquals("higher_better", ComparisonService.getDimensionDirection("communication"));
    }

    // ── Helper methods ──

    private Map<String, Object> makeOp(String testItem, String dimension, double latencyMean, double throughput) {
        Map<String, Object> op = new HashMap<>();
        op.put("testItem", testItem);
        op.put("dimension", dimension);
        op.put("latencyMean", latencyMean);
        op.put("throughput", throughput);
        op.put("dataStatus", "VALID");
        op.put("passed", true);
        return op;
    }

    private double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
