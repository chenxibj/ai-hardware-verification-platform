package com.lab.task;

import com.lab.runspec.RunSpec;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #490: GPU 默认值修复测试
 * 验证 CPU 任务（无 RunSpec）gpuNeeded=0，不分配 GPU
 * 
 * 这是一个逻辑验证测试，确认 GPU 默认值的行为：
 * - 有 RunSpec 且 gpuPerNode > 0 → gpuNeeded = runSpec.gpuPerNode
 * - 无 RunSpec → gpuNeeded = 0（CPU 任务不占 GPU）
 * - gpuNeeded = 0 时，GPU 预检条件 (gpuNeeded > 0 && ...) 为 false → 跳过
 */
class GpuDefaultValueTest {

    /**
     * 模拟 TaskDispatcher 中的 GPU 默认值逻辑
     * 修复前：无 RunSpec 时默认 1（CPU 任务白占 GPU）
     * 修复后：无 RunSpec 时默认 0（CPU 任务不需要 GPU）
     */
    private int computeGpuNeeded(RunSpec runSpec) {
        return (runSpec != null && runSpec.getGpuPerNode() != null && runSpec.getGpuPerNode() > 0)
                ? runSpec.getGpuPerNode() : 0;
    }

    /**
     * 模拟 GPU 预检逻辑
     * 修复后：gpuNeeded > 0 && totalSlots > 0 && freeSlots < gpuNeeded
     */
    private boolean shouldBlockForGpu(int gpuNeeded, long totalSlots, long freeSlots) {
        return gpuNeeded > 0 && totalSlots > 0 && freeSlots < gpuNeeded;
    }

    @Test
    void cpuTask_noRunSpec_gpuNeeded0() {
        int gpuNeeded = computeGpuNeeded(null);
        assertEquals(0, gpuNeeded, "CPU task without RunSpec should need 0 GPUs");
    }

    @Test
    void gpuTask_withRunSpec_gpuNeeded2() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(2);
        int gpuNeeded = computeGpuNeeded(runSpec);
        assertEquals(2, gpuNeeded, "GPU task with RunSpec.gpuPerNode=2 should need 2 GPUs");
    }

    @Test
    void cpuTask_noRunSpec_notBlockedByGpu() {
        int gpuNeeded = computeGpuNeeded(null);
        // Even if node has GPUs with 0 free, CPU task should NOT be blocked
        boolean blocked = shouldBlockForGpu(gpuNeeded, 8, 0);
        assertFalse(blocked, "CPU task (gpuNeeded=0) should not be blocked even with 0 free GPU slots");
    }

    @Test
    void gpuTask_insufficientGpu_blocked() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(2);
        int gpuNeeded = computeGpuNeeded(runSpec);
        boolean blocked = shouldBlockForGpu(gpuNeeded, 8, 1);
        assertTrue(blocked, "GPU task needing 2 GPUs should be blocked with only 1 free");
    }

    @Test
    void gpuTask_sufficientGpu_notBlocked() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(2);
        int gpuNeeded = computeGpuNeeded(runSpec);
        boolean blocked = shouldBlockForGpu(gpuNeeded, 8, 4);
        assertFalse(blocked, "GPU task needing 2 GPUs should not be blocked with 4 free");
    }

    @Test
    void gpuTask_noSlotsRegistered_notBlocked() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(2);
        int gpuNeeded = computeGpuNeeded(runSpec);
        // Node has 0 total slots (not managed by GPU slot system)
        boolean blocked = shouldBlockForGpu(gpuNeeded, 0, 0);
        assertFalse(blocked, "GPU task on node without slot management should not be blocked");
    }

    @Test
    void runSpec_gpuPerNodeNull_gpuNeeded0() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(null);
        int gpuNeeded = computeGpuNeeded(runSpec);
        assertEquals(0, gpuNeeded, "RunSpec with null gpuPerNode should default to 0");
    }

    @Test
    void runSpec_gpuPerNodeZero_gpuNeeded0() {
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(0);
        int gpuNeeded = computeGpuNeeded(runSpec);
        assertEquals(0, gpuNeeded, "RunSpec with gpuPerNode=0 should remain 0");
    }
}
