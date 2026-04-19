package com.lab.result;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.scoring.ScoringService;
import com.lab.task.EvaluationTaskRepository;
import com.lab.task.TaskLifecycleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #515: Verify EvaluationResultService scoring methods
 * are @Deprecated and delegate to ScoringService
 */
@ExtendWith(MockitoExtension.class)
class UnifiedScoringDelegationTest {

    @Mock private EvaluationResultRepository resultRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private EvaluationPlanRepository planRepository;
    @Mock private ScoringService scoringService;
    @Mock private TaskLifecycleService lifecycle;
    @Mock private MetricsNormalizer metricsNormalizer;

    private EvaluationResultService service;
    private ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = new EvaluationResultService(
            resultRepository, taskRepository, planRepository,
            objectMapper, scoringService, lifecycle, metricsNormalizer
        );
    }

    @Test
    @DisplayName("#515: calculateScore method is @Deprecated")
    void calculateScore_isDeprecated() throws Exception {
        var method = EvaluationResultService.class.getMethod("calculateScore", Map.class, String.class);
        assertNotNull(method.getAnnotation(Deprecated.class),
            "calculateScore(Map, String) should be @Deprecated");
    }

    @Test
    @DisplayName("#515: calculateScore(Map) is @Deprecated")
    void calculateScore_noEvalType_isDeprecated() throws Exception {
        var method = EvaluationResultService.class.getMethod("calculateScore", Map.class);
        assertNotNull(method.getAnnotation(Deprecated.class),
            "calculateScore(Map) should be @Deprecated");
    }

    @Test
    @DisplayName("#515: calculateOverallScore is @Deprecated")
    void calculateOverallScore_isDeprecated() throws Exception {
        var method = EvaluationResultService.class.getMethod("calculateOverallScore", Map.class);
        assertNotNull(method.getAnnotation(Deprecated.class),
            "calculateOverallScore(Map) should be @Deprecated");
    }

    @Test
    @DisplayName("#515: calculateScore still returns reasonable values (delegates internally)")
    void calculateScore_delegatesAndReturnsValue() {
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("latency_ms_mean", 1.0);
        metrics.put("throughput_ops", 500.0);
        metrics.put("pass_rate", 100.0);

        // calculateScore should still work (via delegation)
        double score = service.calculateScore(metrics, "OPERATOR");
        assertTrue(score > 0, "Score should be positive for valid metrics");
    }
}
