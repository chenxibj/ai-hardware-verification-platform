package com.lab.dimension;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

/**
 * #459: DimensionRegistry unit tests
 */
class DimensionRegistryTest {

    @Test
    void testGetKeyByOperator_exactMatch() {
        assertEquals("compute", DimensionRegistry.getKeyByOperator("MatMul"));
        assertEquals("compute", DimensionRegistry.getKeyByOperator("Conv2D"));
        assertEquals("memory", DimensionRegistry.getKeyByOperator("Transpose"));
        assertEquals("communication", DimensionRegistry.getKeyByOperator("AllReduce"));
        assertEquals("op_compat", DimensionRegistry.getKeyByOperator("ReLU"));
        assertEquals("training", DimensionRegistry.getKeyByOperator("Adam"));
        assertEquals("inference", DimensionRegistry.getKeyByOperator("Attention"));
        assertEquals("inference", DimensionRegistry.getKeyByOperator("MLP-Large"));
    }

    @Test
    void testGetKeyByOperator_prefixMatch() {
        assertEquals("inference", DimensionRegistry.getKeyByOperator("MLP-Medium/batch=4"));
        assertEquals("inference", DimensionRegistry.getKeyByOperator("BERT-base-uncased"));
        assertEquals("inference", DimensionRegistry.getKeyByOperator("LLaMA-7B"));
    }

    @Test
    void testGetKeyByOperator_fuzzyMatch() {
        assertEquals("inference", DimensionRegistry.getKeyByOperator("some_mlp_model"));
        assertEquals("inference", DimensionRegistry.getKeyByOperator("resnet50_inference"));
        assertEquals("communication", DimensionRegistry.getKeyByOperator("custom_allreduce"));
        assertEquals("training", DimensionRegistry.getKeyByOperator("backward_pass"));
    }

    @Test
    void testGetKeyByOperator_null() {
        assertEquals("compute", DimensionRegistry.getKeyByOperator(null));
    }

    @Test
    void testGetKeyByOperator_unknown() {
        assertEquals("compute", DimensionRegistry.getKeyByOperator("UnknownOp"));
    }

    @Test
    void testNormalizeKey_englishKey() {
        assertEquals("compute", DimensionRegistry.normalizeKey("compute"));
        assertEquals("memory", DimensionRegistry.normalizeKey("memory"));
        assertEquals("inference", DimensionRegistry.normalizeKey("inference"));
    }

    @Test
    void testNormalizeKey_chineseLabel() {
        assertEquals("compute", DimensionRegistry.normalizeKey("计算"));
        assertEquals("memory", DimensionRegistry.normalizeKey("访存"));
        assertEquals("communication", DimensionRegistry.normalizeKey("通信"));
        assertEquals("op_compat", DimensionRegistry.normalizeKey("算子兼容"));
        assertEquals("training", DimensionRegistry.normalizeKey("训练"));
        assertEquals("inference", DimensionRegistry.normalizeKey("推理"));
        assertEquals("scalability", DimensionRegistry.normalizeKey("扩展性"));
        assertEquals("ecosystem", DimensionRegistry.normalizeKey("生态"));
    }

    @Test
    void testNormalizeKey_legacyNames() {
        assertEquals("compute", DimensionRegistry.normalizeKey("计算性能"));
        assertEquals("memory", DimensionRegistry.normalizeKey("访存性能"));
        assertEquals("op_compat", DimensionRegistry.normalizeKey("数学函数"));
        assertEquals("inference", DimensionRegistry.normalizeKey("Attention能力"));
        assertEquals("op_compat", DimensionRegistry.normalizeKey("归一化性能"));
        assertEquals("inference", DimensionRegistry.normalizeKey("模型推理"));
        assertEquals("op_compat", DimensionRegistry.normalizeKey("其他"));
    }

    @Test
    void testNormalizeKey_null() {
        assertEquals("compute", DimensionRegistry.normalizeKey(null));
    }

    @Test
    void testGetLabelByKey() {
        assertEquals("计算", DimensionRegistry.getLabelByKey("compute"));
        assertEquals("访存", DimensionRegistry.getLabelByKey("memory"));
        assertEquals("通信", DimensionRegistry.getLabelByKey("communication"));
        assertEquals("算子兼容", DimensionRegistry.getLabelByKey("op_compat"));
        assertEquals("训练", DimensionRegistry.getLabelByKey("training"));
        assertEquals("推理", DimensionRegistry.getLabelByKey("inference"));
        assertEquals("扩展性", DimensionRegistry.getLabelByKey("scalability"));
        assertEquals("生态", DimensionRegistry.getLabelByKey("ecosystem"));
    }

    @Test
    void testGetLabelByKey_unknown() {
        assertEquals("unknown_dim", DimensionRegistry.getLabelByKey("unknown_dim"));
    }

    @Test
    void testGetDirectionByKey() {
        assertEquals("lower_better", DimensionRegistry.getDirectionByKey("compute"));
        assertEquals("higher_better", DimensionRegistry.getDirectionByKey("communication"));
        assertEquals("higher_better", DimensionRegistry.getDirectionByKey("training"));
    }

    @Test
    void testGetPrimaryMetricByKey() {
        assertEquals("latencyMean", DimensionRegistry.getPrimaryMetricByKey("compute"));
        assertEquals("busBandwidth", DimensionRegistry.getPrimaryMetricByKey("communication"));
        assertEquals("throughput", DimensionRegistry.getPrimaryMetricByKey("training"));
        assertEquals("scalingEfficiency", DimensionRegistry.getPrimaryMetricByKey("scalability"));
        assertEquals("passRate", DimensionRegistry.getPrimaryMetricByKey("ecosystem"));
    }

    @Test
    void testAllKeys() {
        List<String> keys = DimensionRegistry.allKeys();
        assertEquals(8, keys.size());
        assertEquals("compute", keys.get(0));
        assertEquals("ecosystem", keys.get(7));
    }

    @Test
    void testAllLabels() {
        List<String> labels = DimensionRegistry.allLabels();
        assertEquals(8, labels.size());
        assertEquals("计算", labels.get(0));
        assertEquals("生态", labels.get(7));
    }

    @Test
    void testGetByKey() {
        var def = DimensionRegistry.getByKey("inference");
        assertNotNull(def);
        assertEquals("推理", def.label());
        assertEquals("latencyMean", def.primaryMetric());
        assertTrue(def.operators().contains("Attention"));
        assertTrue(def.operators().contains("MLP"));
    }

    @Test
    void testDimensionCount() {
        assertEquals(8, DimensionRegistry.DIMENSIONS.size());
    }
}
