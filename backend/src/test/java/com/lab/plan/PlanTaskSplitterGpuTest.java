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
 * - OPERATOR tasks always get gpu-1 (single GPU) regardless of plan RunSpec
 * - MODEL/TRAINING tasks inherit plan's RunSpec (multi-GPU)
 */
@ExtendWith(MockitoExtension.class)
class PlanTaskSplitterGpuTest {

    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private RunSpecRepository runSpecRepository;
    @Mock private TaskTemplateRepository taskTemplateRepository;

    @InjectMocks
    private PlanTaskSplitter splitter;

    private RunSpec gpuOne;
    private RunSpec gpuFour;
    private RunSpec gpuEight;
    private RunSpec cpuOne;

    @BeforeEach
    void setUp() {
        gpuOne = new RunSpec();
        gpuOne.setId(13L);
        gpuOne.setCode("gpu-1");
        gpuOne.setGpuPerNode(1);
        gpuOne.setNodeCount(1);
        gpuOne.setCategory("GPU");

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

        cpuOne = new RunSpec();
        cpuOne.setId(11L);
        cpuOne.setCode("cpu-1");
        cpuOne.setGpuPerNode(0);
        cpuOne.setNodeCount(1);
        cpuOne.setCategory("CPU");
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
     * Test 1: Chip comprehensive eval + gpu-4 RunSpec
     * OPERATOR tasks get gpu-1, MODEL tasks get gpu-4
     */
    @Test
    void chipEval_gpu4_operatorGetsSingleGpu_modelGetsGpu4() {
        EvaluationPlan plan = makePlan(15L, "{\"preset\":\"QUICK\"}");

        when(runSpecRepository.findByCode("gpu-1")).thenReturn(Optional.of(gpuOne));
        when(runSpecRepository.findById(15L)).thenReturn(Optional.of(gpuFour));
        when(taskRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        var tasks = splitter.splitPlanToTasks(plan);

        // QUICK preset: 5 operators + 4 model tasks = 9
        assertFalse(tasks.isEmpty());

        for (EvaluationTask task : tasks) {
            if (task.getTestSubject() == EvaluationTask.TestSubject.OPERATOR) {
                assertEquals(13L, task.getRunSpecId(), "OPERATOR task should use gpu-1 (id=13)");
                assertEquals("gpu-1", task.getRunSpecCode(), "OPERATOR task runSpecCode should be gpu-1");
            } else if (task.getTestSubject() == EvaluationTask.TestSubject.MODEL) {
                assertEquals(15L, task.getRunSpecId(), "MODEL task should use gpu-4 (id=15)");
                assertEquals("gpu-4", task.getRunSpecCode(), "MODEL task runSpecCode should be gpu-4");
            }
        }
    }

    /**
     * Test 2: Chip comprehensive eval + gpu-8 RunSpec
     * OPERATOR tasks get gpu-1, TRAINING tasks get gpu-8
     */
    @Test
    void chipEval_gpu8_operatorGetsSingleGpu_trainingGetsGpu8() {
        EvaluationPlan plan = makePlan(16L,
            "{\"templateId\":94,\"preset\":\"STANDARD\"}");

        com.lab.template.TaskTemplate template = new com.lab.template.TaskTemplate();
        template.setId(94L);
        template.setConfigJson("{\"operators\":[\"MatMul\",\"Conv2D\"],\"models\":[],\"training\":[\"ResNet-50-finetune\"]}");

        when(taskTemplateRepository.findById(94L)).thenReturn(Optional.of(template));
        when(runSpecRepository.findByCode("gpu-1")).thenReturn(Optional.of(gpuOne));
        when(runSpecRepository.findById(16L)).thenReturn(Optional.of(gpuEight));
        when(taskRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        var tasks = splitter.splitPlanToTasks(plan);

        assertEquals(3, tasks.size(), "Should have 2 operators + 1 training");

        for (EvaluationTask task : tasks) {
            if (task.getTestSubject() == EvaluationTask.TestSubject.OPERATOR) {
                assertEquals(13L, task.getRunSpecId(), "OPERATOR -> gpu-1");
                assertEquals("gpu-1", task.getRunSpecCode());
            } else if (task.getTestSubject() == EvaluationTask.TestSubject.TRAINING) {
                assertEquals(16L, task.getRunSpecId(), "TRAINING -> gpu-8");
                assertEquals("gpu-8", task.getRunSpecCode());
            }
        }
    }

    /**
     * Test 3: CPU RunSpec (cpu-1) -> OPERATOR tasks still get gpu-1, MODEL tasks get cpu-1
     */
    @Test
    void cpuRunSpec_operatorGetsGpu1_modelGetsCpu1() {
        EvaluationPlan plan = makePlan(11L, "{\"preset\":\"QUICK\"}");

        when(runSpecRepository.findByCode("gpu-1")).thenReturn(Optional.of(gpuOne));
        when(runSpecRepository.findById(11L)).thenReturn(Optional.of(cpuOne));
        when(taskRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        var tasks = splitter.splitPlanToTasks(plan);
        assertFalse(tasks.isEmpty());

        for (EvaluationTask task : tasks) {
            if (task.getTestSubject() == EvaluationTask.TestSubject.OPERATOR) {
                // OPERATOR always forced to gpu-1
                assertEquals(13L, task.getRunSpecId());
                assertEquals("gpu-1", task.getRunSpecCode());
            } else {
                // MODEL tasks use plan's RunSpec (cpu-1)
                assertEquals(11L, task.getRunSpecId());
                assertEquals("cpu-1", task.getRunSpecCode());
            }
        }
    }

    /**
     * Test 4: No RunSpec on plan -> tasks have no RunSpec (backward compatible)
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
     * Test 5: gpu-1 RunSpec -> all tasks use gpu-1 (no downgrade needed, same result)
     */
    @Test
    void gpu1RunSpec_allTasksUseGpu1() {
        EvaluationPlan plan = makePlan(13L, "{\"preset\":\"QUICK\"}");

        // OPERATOR path calls findByCode("gpu-1"), MODEL path calls findById(13)
        when(runSpecRepository.findByCode("gpu-1")).thenReturn(Optional.of(gpuOne));
        when(runSpecRepository.findById(13L)).thenReturn(Optional.of(gpuOne));
        when(taskRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        var tasks = splitter.splitPlanToTasks(plan);
        assertFalse(tasks.isEmpty());

        for (EvaluationTask task : tasks) {
            assertEquals(13L, task.getRunSpecId(), "All tasks should use gpu-1");
            assertEquals("gpu-1", task.getRunSpecCode());
        }
    }
}
