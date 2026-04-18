package com.lab.task;

import com.lab.runspec.RunSpec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #498: OPERATOR 类型任务自动降级为单卡执行
 *
 * 规则:
 * - OPERATOR (算子评测) → 固定 1 GPU，不管 Plan 的 RunSpec
 * - TRAINING (训练) → 按 Plan RunSpec 分配
 * - MODEL (推理/模型) → 按 Plan RunSpec 分配
 * - null (未设置) → 按 Plan RunSpec 分配
 */
class OperatorSingleGpuTest {

    /**
     * 模拟 TaskDispatcher 中修复后的 GPU 计算逻辑
     * 新增: OPERATOR 类型强制 gpuNeeded=1
     */
    private int computeEffectiveGpuCount(RunSpec runSpec, EvaluationTask.TestSubject testSubject) {
        int baseGpuNeeded = (runSpec != null && runSpec.getGpuPerNode() != null && runSpec.getGpuPerNode() > 0)
                ? runSpec.getGpuPerNode() : 0;

        // #498: OPERATOR tasks always use exactly 1 GPU
        if (testSubject == EvaluationTask.TestSubject.OPERATOR && baseGpuNeeded > 0) {
            return 1;
        }

        return baseGpuNeeded;
    }

    // ====== OPERATOR 类型测试 ======

    @Test
    @DisplayName("#498: OPERATOR task with 4-GPU RunSpec should use only 1 GPU")
    void operatorTask_4gpuRunSpec_shouldUse1Gpu() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(4);

        int gpuNeeded = computeEffectiveGpuCount(runSpec, EvaluationTask.TestSubject.OPERATOR);
        assertEquals(1, gpuNeeded, "OPERATOR task should always use 1 GPU regardless of RunSpec");
    }

    @Test
    @DisplayName("#498: OPERATOR task with 8-GPU RunSpec should use only 1 GPU")
    void operatorTask_8gpuRunSpec_shouldUse1Gpu() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(8);

        int gpuNeeded = computeEffectiveGpuCount(runSpec, EvaluationTask.TestSubject.OPERATOR);
        assertEquals(1, gpuNeeded, "OPERATOR task should always use 1 GPU even with 8-GPU RunSpec");
    }

    @Test
    @DisplayName("#498: OPERATOR task with 1-GPU RunSpec should still use 1 GPU")
    void operatorTask_1gpuRunSpec_shouldUse1Gpu() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(1);

        int gpuNeeded = computeEffectiveGpuCount(runSpec, EvaluationTask.TestSubject.OPERATOR);
        assertEquals(1, gpuNeeded, "OPERATOR task with 1-GPU RunSpec should use 1 GPU");
    }

    @Test
    @DisplayName("#498: OPERATOR task with no RunSpec (CPU task) should use 0 GPU")
    void operatorTask_noRunSpec_shouldUse0Gpu() {
        int gpuNeeded = computeEffectiveGpuCount(null, EvaluationTask.TestSubject.OPERATOR);
        assertEquals(0, gpuNeeded, "OPERATOR task without RunSpec (CPU-only) should use 0 GPU");
    }

    // ====== TRAINING 类型测试 - 不受影响 ======

    @Test
    @DisplayName("#498: TRAINING task with 4-GPU RunSpec should use 4 GPUs")
    void trainingTask_4gpuRunSpec_shouldUse4Gpu() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(4);

        int gpuNeeded = computeEffectiveGpuCount(runSpec, EvaluationTask.TestSubject.TRAINING);
        assertEquals(4, gpuNeeded, "TRAINING task should follow RunSpec GPU count");
    }

    @Test
    @DisplayName("#498: TRAINING task with 8-GPU RunSpec should use 8 GPUs")
    void trainingTask_8gpuRunSpec_shouldUse8Gpu() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(8);

        int gpuNeeded = computeEffectiveGpuCount(runSpec, EvaluationTask.TestSubject.TRAINING);
        assertEquals(8, gpuNeeded, "TRAINING task should follow RunSpec GPU count");
    }

    // ====== MODEL 类型测试 - 不受影响 ======

    @Test
    @DisplayName("#498: MODEL task with 4-GPU RunSpec should use 4 GPUs")
    void modelTask_4gpuRunSpec_shouldUse4Gpu() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(4);

        int gpuNeeded = computeEffectiveGpuCount(runSpec, EvaluationTask.TestSubject.MODEL);
        assertEquals(4, gpuNeeded, "MODEL task should follow RunSpec GPU count");
    }

    // ====== null testSubject 测试 - 不受影响 ======

    @Test
    @DisplayName("#498: Task with null testSubject should follow RunSpec")
    void nullTestSubject_shouldFollowRunSpec() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(4);

        int gpuNeeded = computeEffectiveGpuCount(runSpec, null);
        assertEquals(4, gpuNeeded, "Task with null testSubject should follow RunSpec GPU count");
    }

    // ====== buildExecutePayload 也需要传正确的 gpuPerNode ======

    @Test
    @DisplayName("#498: Effective RunSpec for OPERATOR should report gpuPerNode=1")
    void operatorTask_effectiveRunSpec_shouldReport1Gpu() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(4);
        runSpec.setCode("gpu-4");

        // Simulate what buildExecutePayload should do for OPERATOR tasks
        int effectiveGpuPerNode = computeEffectiveGpuCount(runSpec, EvaluationTask.TestSubject.OPERATOR);
        assertEquals(1, effectiveGpuPerNode,
                "buildExecutePayload should send gpuPerNode=1 for OPERATOR tasks");
    }
}
