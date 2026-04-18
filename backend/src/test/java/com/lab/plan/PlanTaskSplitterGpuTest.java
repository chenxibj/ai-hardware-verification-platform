package com.lab.plan;

import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.template.TaskTemplateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

/**
 * #485: PlanTaskSplitter GPU allocation tests
 * Verifies that ALL tasks (including OPERATOR) inherit the Plan's RunSpec.
 * GPU visibility control (single-GPU for operators) is handled at executor level,
 * not at task splitting level. All GPU Slots remain reserved (Plan-level reservation).
 */
@ExtendWith(MockitoExtension.class)
class PlanTaskSplitterGpuTest {

    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private RunSpecRepository runSpecRepository;
    @Mock private TaskTemplateRepository taskTemplateRepository;

    @InjectMocks
    private PlanTaskSplitter splitter;

    private RunSpec gpuFour;
    private RunSpec gpuEight;

    @BeforeEach
    void setUp() {
        gpuFour = new RunSpec();
        gpuFour.setId(15L);
        gpuFour.setCode("gpu-4");
        gpuFour.setGpuPerNode(4);
        gpuFour.setNodeCount(1);
        gpuFour.setCategory("GPU");

        gpuEight = new RunSpec();
        gpuEight.setId(16L);
        gpuEight.setCode("gpu-8");
        gpuEight.setGpuPerNode(8);
        gpuEight.setNodeCount(1);
        gpuEight.setCategory("GPU");
    }

    private EvaluationPlan makePlan(Long runSpecId, String evalConfig) {
        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(100L);
        plan.setPlanNo("PLAN-TEST-001");
        plan.setChipId(1L);
        plan.setRunSpecId(runSpecId);
        plan.setCreatedBy(1L);
        plan.setStatus(EvaluationPlan.PlanStatus.DRAFT);
        plan.setEvalConfig(evalConfig != null ? evalConfig : "{\"preset\":\"QUICK\"}");
        return plan;
    }

    /**
     * Test 1: gpu-4 RunSpec — ALL tasks (including OPERATOR) get gpu-4
     * GPU visibility (single-GPU for operator) is handled by executor, not splitter.
     */
    @Test
    void gpu4_allTasksInheritPlanRunSpec() {
        EvaluationPlan plan = makePlan(15L, "{\"preset\":\"QUICK\"}");

        when(runSpecRepository.findById(15L)).thenReturn(Optional.of(gpuFour));
        when(taskRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        var tasks = splitter.splitPlanToTasks(plan);
        assertFalse(tasks.isEmpty());

        for (EvaluationTask task : tasks) {
            assertEquals(15L, task.getRunSpecId(),
                "ALL tasks (including OPERATOR) should inherit plan's gpu-4 RunSpec");
            assertEquals("gpu-4", task.getRunSpecCode());
        }

        // Verify we have both OPERATOR and MODEL tasks
        long opCount = tasks.stream()
            .filter(t -> t.getTestSubject() == EvaluationTask.TestSubject.OPERATOR).count();
        long modelCount = tasks.stream()
            .filter(t -> t.getTestSubject() == EvaluationTask.TestSubject.MODEL).count();
        assertTrue(opCount > 0, "Should have OPERATOR tasks");
        assertTrue(modelCount > 0, "Should have MODEL tasks");
    }

    /**
     * Test 2: gpu-8 + template with training — ALL tasks get gpu-8
     */
    @Test
    void gpu8_templateWithTraining_allTasksInheritRunSpec() {
        EvaluationPlan plan = makePlan(16L,
            "{\"templateId\":94,\"preset\":\"STANDARD\"}");

        com.lab.template.TaskTemplate template = new com.lab.template.TaskTemplate();
        template.setId(94L);
        template.setConfigJson("{\"operators\":[\"MatMul\",\"Conv2D\"],\"models\":[\"MLP-Small\"],\"training\":[\"ResNet-50-finetune\"]}");

        when(taskTemplateRepository.findById(94L)).thenReturn(Optional.of(template));
        when(runSpecRepository.findById(16L)).thenReturn(Optional.of(gpuEight));
        when(taskRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        var tasks = splitter.splitPlanToTasks(plan);
        assertEquals(4, tasks.size(), "Should have 2 operators + 1 model + 1 training");

        for (EvaluationTask task : tasks) {
            assertEquals(16L, task.getRunSpecId(),
                task.getTestSubject() + " task should inherit plan's gpu-8");
            assertEquals("gpu-8", task.getRunSpecCode());
        }
    }

    /**
     * Test 3: No RunSpec on plan — tasks have no RunSpec (backward compatible)
     */
    @Test
    void noRunSpec_tasksHaveNoRunSpec() {
        EvaluationPlan plan = makePlan(null, "{\"preset\":\"QUICK\"}");

        when(taskRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        var tasks = splitter.splitPlanToTasks(plan);
        assertFalse(tasks.isEmpty());

        for (EvaluationTask task : tasks) {
            assertNull(task.getRunSpecId(), "Tasks should have no runSpecId when plan has none");
            assertNull(task.getRunSpecCode(), "Tasks should have no runSpecCode when plan has none");
        }
    }

    /**
     * Test 4: Operator tasks get correct evalType and testSubject
     * (ensures the downstream executor will see OPERATOR type for GPU visibility logic)
     */
    @Test
    void operatorTasks_haveCorrectEvalType() {
        EvaluationPlan plan = makePlan(15L, "{\"preset\":\"QUICK\"}");

        when(runSpecRepository.findById(15L)).thenReturn(Optional.of(gpuFour));
        when(taskRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        var tasks = splitter.splitPlanToTasks(plan);

        for (EvaluationTask task : tasks) {
            if (task.getTestSubject() == EvaluationTask.TestSubject.OPERATOR) {
                assertEquals(EvaluationTask.EvalType.OPERATOR, task.getEvalType(),
                    "OPERATOR tasks must have evalType=OPERATOR for executor GPU visibility logic");
            } else if (task.getTestSubject() == EvaluationTask.TestSubject.MODEL) {
                assertEquals(EvaluationTask.EvalType.MODEL, task.getEvalType());
            }
        }
    }
}
