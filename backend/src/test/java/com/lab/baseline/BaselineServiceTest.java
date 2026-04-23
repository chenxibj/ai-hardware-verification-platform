package com.lab.baseline;

import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.chipreport.ChipReport;
import com.lab.chipreport.ChipReportRepository;
import com.lab.chipreport.ReportGeneratorService;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;
import com.lab.scoring.ScoringService;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Tests for BaselineService covering:
 * #528: Base functionality
 * #531: Staleness warning
 * #532: Auto-recommend plans by coverage
 * #533: Report regeneration on baseline switch
 * #534: Operator round count and stdDev
 */
@ExtendWith(MockitoExtension.class)
class BaselineServiceTest {

    @Mock private ChipRepository chipRepository;
    @Mock private EvaluationPlanRepository planRepository;
    @Mock private EvaluationResultRepository resultRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private RunSpecRepository runSpecRepository;
    @Mock private ScoringService scoringService;
    @Mock private ChipReportRepository reportRepository;
    @Mock private ReportGeneratorService reportGeneratorService;

    private BaselineService baselineService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        baselineService = new BaselineService(
            chipRepository, planRepository, resultRepository,
            taskRepository, runSpecRepository, scoringService,
            reportRepository, reportGeneratorService, objectMapper);
        baselineService.setStaleWarningDays(90);
        baselineService.setUnstableStddevThreshold(0.3);
    }

    // Helper methods
    private Chip createChip(Long id, String name) {
        Chip chip = new Chip();
        chip.setId(id);
        chip.setName(name);
        chip.setChipNo("CHIP-" + id);
        return chip;
    }

    private RunSpec createRunSpec(Long id, String name, String code, int gpuPerNode) {
        RunSpec spec = new RunSpec();
        spec.setId(id);
        spec.setName(name);
        spec.setCode(code);
        spec.setGpuPerNode(gpuPerNode);
        spec.setCategory("gpu");
        return spec;
    }

    private EvaluationPlan createPlan(Long id, Long chipId, Long runSpecId, Instant completedAt) {
        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(id);
        plan.setPlanNo("PLAN-" + id);
        plan.setChipId(chipId);
        plan.setRunSpecId(runSpecId);
        plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
        plan.setCompletedAt(completedAt);
        plan.setCreatedAt(completedAt);
        plan.setTotalTasks(10);
        plan.setCompletedTasks(10);
        return plan;
    }

    private EvaluationTask createTask(Long id, Long planId, String testItem) {
        EvaluationTask task = new EvaluationTask();
        task.setId(id);
        task.setPlanId(planId);
        task.setTestItem(testItem);
        return task;
    }

    private EvaluationResult createResult(Long id, Long taskId, Long planId, String metricsJson) {
        EvaluationResult result = new EvaluationResult();
        result.setId(id);
        result.setTaskId(taskId);
        result.setPlanId(planId);
        result.setMetricsSummary(metricsJson);
        result.setDataStatus("VALID");
        return result;
    }

    // ======= #528: Base functionality =======

    @Nested
    @DisplayName("#528: Base functionality")
    class BaseFunctionality {

        @Test
        @DisplayName("listBaselines groups by runSpec")
        void listBaselines_groupsByRunSpec() {
            Chip chip = createChip(1L, "Test Chip");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            RunSpec spec1 = createRunSpec(13L, "Single GPU", "GPU-1", 1);
            RunSpec spec2 = createRunSpec(15L, "Quad GPU", "GPU-4", 4);
            when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec1));
            when(runSpecRepository.findById(15L)).thenReturn(Optional.of(spec2));

            EvaluationPlan plan1 = createPlan(100L, 1L, 13L, Instant.now());
            EvaluationPlan plan2 = createPlan(101L, 1L, 15L, Instant.now());

            when(planRepository.findByChipId(1L)).thenReturn(List.of(plan1, plan2));
            when(resultRepository.findByPlanId(anyLong())).thenReturn(List.of());
            when(taskRepository.findByPlanId(anyLong())).thenReturn(List.of());

            List<Map<String, Object>> baselines = baselineService.listBaselines(1L);

            assertEquals(2, baselines.size());
            assertTrue(baselines.stream().anyMatch(b -> Long.valueOf(13L).equals(b.get("runSpecId"))));
            assertTrue(baselines.stream().anyMatch(b -> Long.valueOf(15L).equals(b.get("runSpecId"))));
        }

        @Test
        @DisplayName("setDefaultBaseline updates chip and clears cache")
        void setDefaultBaseline_updatesChipAndClearsCache() {
            Chip chip = createChip(1L, "Test Chip");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));
            when(reportRepository.findByChipIdOrderByCreatedAtAsc(1L)).thenReturn(List.of());

            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now());
            when(planRepository.findById(100L)).thenReturn(Optional.of(plan));
            when(chipRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            Map<String, Object> result = baselineService.setDefaultBaseline(1L, 100L);

            assertEquals(100L, result.get("defaultBaselinePlanId"));
            verify(scoringService).clearBaselineCache();
            verify(chipRepository).save(chip);
            assertEquals(100L, chip.getDefaultBaselinePlanId());
        }

        @Test
        @DisplayName("setDefaultBaseline rejects plan from different chip")
        void setDefaultBaseline_rejectsDifferentChip() {
            Chip chip = createChip(1L, "Test");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            EvaluationPlan plan = createPlan(200L, 2L, 13L, Instant.now());
            when(planRepository.findById(200L)).thenReturn(Optional.of(plan));

            assertThrows(RuntimeException.class, () -> baselineService.setDefaultBaseline(1L, 200L));
        }

        @Test
        @DisplayName("setDefaultBaseline rejects non-completed plan")
        void setDefaultBaseline_rejectsNonCompleted() {
            Chip chip = createChip(1L, "Test");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now());
            plan.setStatus(EvaluationPlan.PlanStatus.RUNNING);
            when(planRepository.findById(100L)).thenReturn(Optional.of(plan));

            assertThrows(RuntimeException.class, () -> baselineService.setDefaultBaseline(1L, 100L));
        }

        @Test
        @DisplayName("getBaselineCoverage returns coverage info")
        void getBaselineCoverage_returnsCoverageInfo() {
            Map<String, Double> baselineMap = Map.of("MatMul", 1.5, "Conv2D", 2.3);
            when(scoringService.getBaselineLatencyMap(13L)).thenReturn(baselineMap);
            when(scoringService.getBaselineSource(13L)).thenReturn(Map.of("available", true));

            RunSpec spec = createRunSpec(13L, "Single GPU", "GPU-1", 1);
            when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec));

            Map<String, Object> coverage = baselineService.getBaselineCoverage(null, 13L);

            assertEquals(2, coverage.get("baselineCoveredItems"));
            assertNotNull(coverage.get("baselineSource"));
            assertEquals(13L, coverage.get("runSpecId"));
        }
    }

    // ======= #531: Staleness warning =======

    @Nested
    @DisplayName("#531: Baseline staleness warning")
    class StalenessWarning {

        @Test
        @DisplayName("Fresh baseline (within 90 days) is not stale")
        void freshBaseline_isNotStale() {
            Chip chip = createChip(1L, "Fresh Chip");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            RunSpec spec = createRunSpec(13L, "Single", "GPU-1", 1);
            when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec));

            // Completed 10 days ago
            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now().minus(10, ChronoUnit.DAYS));
            when(planRepository.findByChipId(1L)).thenReturn(List.of(plan));
            when(resultRepository.findByPlanId(100L)).thenReturn(List.of());
            when(taskRepository.findByPlanId(100L)).thenReturn(List.of());

            List<Map<String, Object>> baselines = baselineService.listBaselines(1L);

            assertEquals(1, baselines.size());
            assertFalse((boolean) baselines.get(0).get("isStale"));
            assertNull(baselines.get(0).get("staleDays"));
        }

        @Test
        @DisplayName("Old baseline (over 90 days) is stale")
        void oldBaseline_isStale() {
            Chip chip = createChip(1L, "Old Chip");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            RunSpec spec = createRunSpec(13L, "Single", "GPU-1", 1);
            when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec));

            // Completed 100 days ago
            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now().minus(100, ChronoUnit.DAYS));
            when(planRepository.findByChipId(1L)).thenReturn(List.of(plan));
            when(resultRepository.findByPlanId(100L)).thenReturn(List.of());
            when(taskRepository.findByPlanId(100L)).thenReturn(List.of());

            List<Map<String, Object>> baselines = baselineService.listBaselines(1L);

            assertEquals(1, baselines.size());
            assertTrue((boolean) baselines.get(0).get("isStale"));
            assertNotNull(baselines.get(0).get("staleDays"));
            assertTrue((long) baselines.get(0).get("staleDays") >= 99);
        }

        @Test
        @DisplayName("Custom stale warning days is respected")
        void customStaleWarningDays() {
            baselineService.setStaleWarningDays(30);

            Chip chip = createChip(1L, "Custom Stale");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            RunSpec spec = createRunSpec(13L, "Single", "GPU-1", 1);
            when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec));

            // 50 days old — stale with 30-day threshold but not with 90
            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now().minus(50, ChronoUnit.DAYS));
            when(planRepository.findByChipId(1L)).thenReturn(List.of(plan));
            when(resultRepository.findByPlanId(100L)).thenReturn(List.of());
            when(taskRepository.findByPlanId(100L)).thenReturn(List.of());

            List<Map<String, Object>> baselines = baselineService.listBaselines(1L);
            assertTrue((boolean) baselines.get(0).get("isStale"));
        }
    }

    // ======= #532: Auto-recommend by coverage =======

    @Nested
    @DisplayName("#532: Auto-recommend plans by coverage")
    class AutoRecommend {

        @Test
        @DisplayName("Plan with coverage >= 80% is marked recommended")
        void planWithHighCoverage_isRecommended() {
            Chip chip = createChip(1L, "Recommend Chip");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            RunSpec spec = createRunSpec(13L, "Single", "GPU-1", 1);
            when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec));

            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now());
            when(planRepository.findByChipId(1L)).thenReturn(List.of(plan));

            // 10 tasks, 9 have results = 90% coverage
            List<EvaluationTask> tasks = new ArrayList<>();
            for (int i = 1; i <= 10; i++) {
                tasks.add(createTask((long) i, 100L, "Op" + i));
            }
            when(taskRepository.findByPlanId(100L)).thenReturn(tasks);

            List<EvaluationResult> results = new ArrayList<>();
            for (int i = 1; i <= 9; i++) {
                results.add(createResult((long) i, (long) i, 100L,
                        "{\"latency_ms_mean\": 1.5, \"avg_latency_ms\": 1.5}"));
            }
            when(resultRepository.findByPlanId(100L)).thenReturn(results);

            List<Map<String, Object>> baselines = baselineService.listBaselines(1L);
            assertEquals(1, baselines.size());

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> plans = (List<Map<String, Object>>) baselines.get(0).get("plans");
            assertTrue((boolean) plans.get(0).get("recommended"));
            assertEquals(100L, baselines.get(0).get("recommendedPlanId"));
        }

        @Test
        @DisplayName("Plan with coverage < 80% is not marked recommended but still selected as best")
        void planWithLowCoverage_isNotRecommendedButStillBest() {
            Chip chip = createChip(1L, "Low Cov Chip");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            RunSpec spec = createRunSpec(13L, "Single", "GPU-1", 1);
            when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec));

            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now());
            when(planRepository.findByChipId(1L)).thenReturn(List.of(plan));

            // 10 tasks, 5 results = 50% coverage
            List<EvaluationTask> tasks = new ArrayList<>();
            for (int i = 1; i <= 10; i++) {
                tasks.add(createTask((long) i, 100L, "Op" + i));
            }
            when(taskRepository.findByPlanId(100L)).thenReturn(tasks);

            List<EvaluationResult> results = new ArrayList<>();
            for (int i = 1; i <= 5; i++) {
                results.add(createResult((long) i, (long) i, 100L,
                        "{\"latency_ms_mean\": 1.5}"));
            }
            when(resultRepository.findByPlanId(100L)).thenReturn(results);

            List<Map<String, Object>> baselines = baselineService.listBaselines(1L);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> plans = (List<Map<String, Object>>) baselines.get(0).get("plans");
            assertFalse((boolean) plans.get(0).get("recommended"));
            // Still selected as best available
            assertEquals(100L, baselines.get(0).get("recommendedPlanId"));
        }

        @Test
        @DisplayName("findRecommendedPlan prefers >= 80% coverage")
        void findRecommendedPlan_prefersHighCoverage() {
            // Plan 1: 50% coverage
            EvaluationPlan plan1 = createPlan(100L, 1L, 13L, Instant.now());
            // Plan 2: 90% coverage
            EvaluationPlan plan2 = createPlan(101L, 1L, 13L, Instant.now());

            when(planRepository.findByChipIdAndRunSpecIdAndStatus(1L, 13L, EvaluationPlan.PlanStatus.COMPLETED))
                    .thenReturn(List.of(plan1, plan2));

            // Plan 1: 10 tasks, 5 results
            List<EvaluationTask> tasks1 = new ArrayList<>();
            for (int i = 1; i <= 10; i++) tasks1.add(createTask((long) i, 100L, "Op" + i));
            when(taskRepository.findByPlanId(100L)).thenReturn(tasks1);
            List<EvaluationResult> results1 = new ArrayList<>();
            for (int i = 1; i <= 5; i++) {
                results1.add(createResult((long) i, (long) i, 100L, "{\"latency_ms_mean\": 1.5}"));
            }
            when(resultRepository.findByPlanId(100L)).thenReturn(results1);

            // Plan 2: 10 tasks, 9 results
            List<EvaluationTask> tasks2 = new ArrayList<>();
            for (int i = 11; i <= 20; i++) tasks2.add(createTask((long) i, 101L, "Op" + (i - 10)));
            when(taskRepository.findByPlanId(101L)).thenReturn(tasks2);
            List<EvaluationResult> results2 = new ArrayList<>();
            for (int i = 11; i <= 19; i++) {
                results2.add(createResult((long) i, (long) i, 101L, "{\"latency_ms_mean\": 1.2}"));
            }
            when(resultRepository.findByPlanId(101L)).thenReturn(results2);

            Long recommended = baselineService.findRecommendedPlan(1L, 13L);
            assertEquals(101L, recommended); // 90% > 80% threshold
        }

        @Test
        @DisplayName("findRecommendedPlan falls back to highest coverage when none >= 80%")
        void findRecommendedPlan_fallbackToHighest() {
            EvaluationPlan plan1 = createPlan(100L, 1L, 13L, Instant.now());
            EvaluationPlan plan2 = createPlan(101L, 1L, 13L, Instant.now());

            when(planRepository.findByChipIdAndRunSpecIdAndStatus(1L, 13L, EvaluationPlan.PlanStatus.COMPLETED))
                    .thenReturn(List.of(plan1, plan2));

            // Plan 1: 10 tasks, 3 results = 30%
            List<EvaluationTask> tasks1 = new ArrayList<>();
            for (int i = 1; i <= 10; i++) tasks1.add(createTask((long) i, 100L, "Op" + i));
            when(taskRepository.findByPlanId(100L)).thenReturn(tasks1);
            List<EvaluationResult> results1 = new ArrayList<>();
            for (int i = 1; i <= 3; i++) {
                results1.add(createResult((long) i, (long) i, 100L, "{\"latency_ms_mean\": 1.5}"));
            }
            when(resultRepository.findByPlanId(100L)).thenReturn(results1);

            // Plan 2: 10 tasks, 7 results = 70%
            List<EvaluationTask> tasks2 = new ArrayList<>();
            for (int i = 11; i <= 20; i++) tasks2.add(createTask((long) i, 101L, "Op" + (i - 10)));
            when(taskRepository.findByPlanId(101L)).thenReturn(tasks2);
            List<EvaluationResult> results2 = new ArrayList<>();
            for (int i = 11; i <= 17; i++) {
                results2.add(createResult((long) i, (long) i, 101L, "{\"latency_ms_mean\": 1.2}"));
            }
            when(resultRepository.findByPlanId(101L)).thenReturn(results2);

            Long recommended = baselineService.findRecommendedPlan(1L, 13L);
            assertEquals(101L, recommended); // 70% is highest
        }

        @Test
        @DisplayName("findRecommendedPlan returns null for empty plans")
        void findRecommendedPlan_noPlan() {
            when(planRepository.findByChipIdAndRunSpecIdAndStatus(1L, 13L, EvaluationPlan.PlanStatus.COMPLETED))
                    .thenReturn(List.of());

            assertNull(baselineService.findRecommendedPlan(1L, 13L));
        }
    }

    // ======= #533: Report regeneration =======

    @Nested
    @DisplayName("#533: Report regeneration on baseline switch")
    class ReportRegeneration {

        @Test
        @DisplayName("Baseline switch triggers report regeneration")
        void baselineSwitch_triggersRegeneration() {
            Chip chip = createChip(1L, "Regen Chip");
            chip.setDefaultBaselinePlanId(50L); // Previous baseline
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));
            when(chipRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now());
            when(planRepository.findById(100L)).thenReturn(Optional.of(plan));

            // Existing report to regenerate
            ChipReport existingReport = new ChipReport();
            existingReport.setId(500L);
            existingReport.setPlanId(100L);
            existingReport.setReportNo("RPT-001");
            when(reportRepository.findByChipIdOrderByCreatedAtAsc(1L)).thenReturn(List.of(existingReport));

            ChipReport newReport = new ChipReport();
            newReport.setId(501L);
            newReport.setReportNo("RPT-002");
            newReport.setPlanId(100L);
            when(reportGeneratorService.generateReport(100L)).thenReturn(newReport);

            Map<String, Object> result = baselineService.setDefaultBaseline(1L, 100L);

            assertEquals(true, result.get("reportRegenerated"));
            assertEquals(501L, result.get("regeneratedReportId"));
            verify(reportRepository).delete(existingReport);
            verify(reportGeneratorService).generateReport(100L);
        }

        @Test
        @DisplayName("Setting same baseline does not trigger regeneration")
        void sameBaseline_noRegeneration() {
            Chip chip = createChip(1L, "Same Chip");
            chip.setDefaultBaselinePlanId(100L); // Already this baseline
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));
            when(chipRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now());
            when(planRepository.findById(100L)).thenReturn(Optional.of(plan));

            Map<String, Object> result = baselineService.setDefaultBaseline(1L, 100L);

            assertNull(result.get("reportRegenerated"));
            verify(reportRepository, never()).findByChipIdOrderByCreatedAtAsc(anyLong());
        }

        @Test
        @DisplayName("Manual regenerateReport works")
        void manualRegenerateReport() {
            ChipReport existing = new ChipReport();
            existing.setId(500L);
            existing.setPlanId(100L);
            existing.setReportNo("RPT-001");
            when(reportRepository.findById(500L)).thenReturn(Optional.of(existing));

            ChipReport newReport = new ChipReport();
            newReport.setId(501L);
            newReport.setReportNo("RPT-002");
            newReport.setPlanId(100L);
            when(reportGeneratorService.generateReport(100L)).thenReturn(newReport);

            ChipReport result = baselineService.regenerateReport(500L);

            assertEquals(501L, result.getId());
            verify(reportRepository).delete(existing);
            verify(reportGeneratorService).generateReport(100L);
        }

        @Test
        @DisplayName("regenerateReport throws when report has no planId")
        void regenerateReport_noPlanId() {
            ChipReport existing = new ChipReport();
            existing.setId(500L);
            existing.setPlanId(null);
            when(reportRepository.findById(500L)).thenReturn(Optional.of(existing));

            assertThrows(RuntimeException.class, () -> baselineService.regenerateReport(500L));
        }

        @Test
        @DisplayName("regenerateReport throws when report not found")
        void regenerateReport_notFound() {
            when(reportRepository.findById(999L)).thenReturn(Optional.empty());

            assertThrows(RuntimeException.class, () -> baselineService.regenerateReport(999L));
        }

        @Test
        @DisplayName("#540: generateReport failure should not delete old report (data loss prevention)")
        void test_setDefaultBaseline_reportRegenFailure_shouldNotDeleteOldReport() {
            Chip chip = createChip(1L, "DataLoss Chip");
            chip.setDefaultBaselinePlanId(50L); // Previous baseline (different from new)
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));
            when(chipRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now());
            when(planRepository.findById(100L)).thenReturn(Optional.of(plan));

            // Existing report
            ChipReport existingReport = new ChipReport();
            existingReport.setId(500L);
            existingReport.setPlanId(100L);
            existingReport.setReportNo("RPT-001");
            when(reportRepository.findByChipIdOrderByCreatedAtAsc(1L)).thenReturn(List.of(existingReport));

            // generateReport throws an exception (simulating OOM, DB failure, etc.)
            when(reportGeneratorService.generateReport(100L))
                    .thenThrow(new RuntimeException("Simulated OOM during report generation"));

            // The setDefaultBaseline should propagate the exception (not swallow it)
            // so the outer transaction can roll back and the old report is preserved
            assertThrows(RuntimeException.class,
                    () -> baselineService.setDefaultBaseline(1L, 100L),
                    "generateReport failure should propagate to caller");

            // The old report should NOT have been deleted since the new one failed
            verify(reportRepository, never()).delete(existingReport);
            verify(reportRepository, never()).flush();
        }
    }

    // ======= #534: Round count and stdDev =======

    @Nested
    @DisplayName("#534: Operator round count and standard deviation")
    class RoundCountAndStdDev {

        @Test
        @DisplayName("Coverage response includes operator details with roundCount")
        void coverageIncludesOperatorDetails() {
            Chip chip = createChip(1L, "StdDev Chip");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            Map<String, Double> baselineMap = Map.of("MatMul", 1.5);
            when(scoringService.getBaselineLatencyMap(13L)).thenReturn(baselineMap);
            when(scoringService.getBaselineSource(13L)).thenReturn(Map.of("available", true));

            RunSpec spec = createRunSpec(13L, "Single", "GPU-1", 1);
            when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec));

            EvaluationPlan plan1 = createPlan(100L, 1L, 13L, Instant.now());
            EvaluationPlan plan2 = createPlan(101L, 1L, 13L, Instant.now());
            when(planRepository.findByChipIdAndRunSpecIdAndStatus(1L, 13L, EvaluationPlan.PlanStatus.COMPLETED))
                    .thenReturn(List.of(plan1, plan2));

            // Plan 1: MatMul task
            EvaluationTask task1 = createTask(1L, 100L, "MatMul");
            when(taskRepository.findByPlanId(100L)).thenReturn(List.of(task1));
            EvaluationResult result1 = createResult(1L, 1L, 100L, "{\"latency_ms_mean\": 2.0}");
            when(resultRepository.findByPlanId(100L)).thenReturn(List.of(result1));

            // Plan 2: MatMul task
            EvaluationTask task2 = createTask(2L, 101L, "MatMul");
            when(taskRepository.findByPlanId(101L)).thenReturn(List.of(task2));
            EvaluationResult result2 = createResult(2L, 2L, 101L, "{\"latency_ms_mean\": 2.5}");
            when(resultRepository.findByPlanId(101L)).thenReturn(List.of(result2));

            Map<String, Object> coverage = baselineService.getBaselineCoverage(1L, 13L);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> operators = (List<Map<String, Object>>) coverage.get("operators");
            assertNotNull(operators);
            assertEquals(1, operators.size());

            Map<String, Object> matmul = operators.get(0);
            assertEquals("MatMul", matmul.get("operator"));
            assertEquals(2, matmul.get("roundCount"));
            assertNotNull(matmul.get("stdDev"));
            assertNotNull(matmul.get("meanLatency"));
            assertEquals(2.25, (double) matmul.get("meanLatency"), 0.01);
        }

        @Test
        @DisplayName("Single-round operator has stdDev=0 and is not unstable")
        void singleRound_zeroStdDev() {
            Chip chip = createChip(1L, "Single Round");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            when(scoringService.getBaselineLatencyMap(13L)).thenReturn(Map.of("Conv2D", 1.0));
            when(scoringService.getBaselineSource(13L)).thenReturn(Map.of());

            RunSpec spec = createRunSpec(13L, "Single", "GPU-1", 1);
            when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec));

            EvaluationPlan plan = createPlan(100L, 1L, 13L, Instant.now());
            when(planRepository.findByChipIdAndRunSpecIdAndStatus(1L, 13L, EvaluationPlan.PlanStatus.COMPLETED))
                    .thenReturn(List.of(plan));

            EvaluationTask task = createTask(1L, 100L, "Conv2D");
            when(taskRepository.findByPlanId(100L)).thenReturn(List.of(task));
            EvaluationResult result = createResult(1L, 1L, 100L, "{\"latency_ms_mean\": 3.0}");
            when(resultRepository.findByPlanId(100L)).thenReturn(List.of(result));

            Map<String, Object> coverage = baselineService.getBaselineCoverage(1L, 13L);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> operators = (List<Map<String, Object>>) coverage.get("operators");
            Map<String, Object> conv2d = operators.get(0);
            assertEquals(1, conv2d.get("roundCount"));
            assertEquals(0.0, conv2d.get("stdDev"));
            assertFalse((boolean) conv2d.get("unstable"));
        }

        @Test
        @DisplayName("High variance operator is marked unstable")
        void highVariance_markedUnstable() {
            baselineService.setUnstableStddevThreshold(0.1); // Low threshold

            Chip chip = createChip(1L, "Unstable Chip");
            when(chipRepository.findById(1L)).thenReturn(Optional.of(chip));

            when(scoringService.getBaselineLatencyMap(13L)).thenReturn(Map.of("MatMul", 1.0));
            when(scoringService.getBaselineSource(13L)).thenReturn(Map.of());

            RunSpec spec = createRunSpec(13L, "Single", "GPU-1", 1);
            when(runSpecRepository.findById(13L)).thenReturn(Optional.of(spec));

            EvaluationPlan plan1 = createPlan(100L, 1L, 13L, Instant.now());
            EvaluationPlan plan2 = createPlan(101L, 1L, 13L, Instant.now());
            when(planRepository.findByChipIdAndRunSpecIdAndStatus(1L, 13L, EvaluationPlan.PlanStatus.COMPLETED))
                    .thenReturn(List.of(plan1, plan2));

            // Very different latencies: 1.0 and 5.0
            EvaluationTask task1 = createTask(1L, 100L, "MatMul");
            when(taskRepository.findByPlanId(100L)).thenReturn(List.of(task1));
            EvaluationResult result1 = createResult(1L, 1L, 100L, "{\"latency_ms_mean\": 1.0}");
            when(resultRepository.findByPlanId(100L)).thenReturn(List.of(result1));

            EvaluationTask task2 = createTask(2L, 101L, "MatMul");
            when(taskRepository.findByPlanId(101L)).thenReturn(List.of(task2));
            EvaluationResult result2 = createResult(2L, 2L, 101L, "{\"latency_ms_mean\": 5.0}");
            when(resultRepository.findByPlanId(101L)).thenReturn(List.of(result2));

            Map<String, Object> coverage = baselineService.getBaselineCoverage(1L, 13L);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> operators = (List<Map<String, Object>>) coverage.get("operators");
            Map<String, Object> matmul = operators.get(0);
            assertTrue((boolean) matmul.get("unstable"));
            assertTrue((double) matmul.get("relativeStdDev") > 0.1);
        }

        @Test
        @DisplayName("extractLatency handles both field names")
        void extractLatency_bothFieldNames() {
            Double l1 = baselineService.extractLatency("{\"latency_ms_mean\": 2.5}");
            assertEquals(2.5, l1);

            Double l2 = baselineService.extractLatency("{\"avg_latency_ms\": 3.7}");
            assertEquals(3.7, l2);

            Double l3 = baselineService.extractLatency("{\"other\": 1.0}");
            assertNull(l3);

            Double l4 = baselineService.extractLatency("invalid json");
            assertNull(l4);
        }
    }
}
