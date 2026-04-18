package com.lab.task;

import com.lab.gpu.GpuSlotService;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.plan.PlanProgressService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * #489: 统一任务终态善后处理。
 * 所有代码路径到达终态时调 onTaskTerminated，完整执行四步：
 * 1. 释放 GPU Slot
 * 2. 释放节点 BUSY → ONLINE
 * 3. 更新 Plan 进度（via PlanProgressService）
 * 4. 触发调度 tryDispatchNext()
 *
 * 每步异常隔离，不因某步失败影响其他步骤。
 * 不加 @Transactional（由调用方决定事务边界）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaskLifecycleService {

    private final GpuSlotService gpuSlotService;
    private final ComputeNodeRepository nodeRepository;
    private final EvaluationTaskRepository taskRepository;
    private final TaskDispatcher taskDispatcher;
    private final PlanProgressService planProgressService;

    /**
     * 任务到达终态的统一善后处理。
     * 所有释放 GPU/节点/Plan进度/触发调度的路径统一调这一个方法。
     */
    public void onTaskTerminated(Long taskId) {
        Long planId = null;

        // 1. 释放 GPU Slot
        try {
            gpuSlotService.releaseGpuSlots(taskId);
        } catch (Exception e) {
            log.warn("GPU slot release failed for task {}: {}", taskId, e.getMessage());
        }

        // 2. 释放节点（BUSY → ONLINE）
        try {
            EvaluationTask task = taskRepository.findById(taskId).orElse(null);
            if (task != null) {
                planId = task.getPlanId();
                if (task.getAssignedNodeId() != null) {
                    nodeRepository.findById(task.getAssignedNodeId()).ifPresent(node -> {
                        if (node.getStatus() == ComputeNode.Status.BUSY) {
                            node.setStatus(ComputeNode.Status.ONLINE);
                            nodeRepository.save(node);
                            log.info("Node {} released back to ONLINE (task {})", node.getName(), taskId);
                        }
                    });
                }
            }
        } catch (Exception e) {
            log.warn("Node release failed for task {}: {}", taskId, e.getMessage());
        }

        // 3. 更新 Plan 进度
        try {
            if (planId != null) {
                planProgressService.updateProgress(planId);
            }
        } catch (Exception e) {
            log.warn("Plan progress update failed for task {} (planId={}): {}", taskId, planId, e.getMessage());
        }

        // 4. 触发调度（让排队任务能立即被分发）
        try {
            taskDispatcher.tryDispatchNext();
        } catch (Exception e) {
            log.debug("Post-terminate dispatch for task {}: {}", taskId, e.getMessage());
        }
    }
}
