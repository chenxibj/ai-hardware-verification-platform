package com.lab.gpu;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * GPU Slot 管理服务
 * #396: allocate (SELECT FOR UPDATE) + release + orphan reclaim
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GpuSlotService {

    private final GpuSlotRepository gpuSlotRepository;
    private final EvaluationTaskRepository taskRepository;

    private static final Set<EvaluationTask.TaskStatus> TERMINAL_STATUSES = Set.of(
            EvaluationTask.TaskStatus.COMPLETED,
            EvaluationTask.TaskStatus.FAILED,
            EvaluationTask.TaskStatus.CANCELLED,
            EvaluationTask.TaskStatus.SKIPPED
    );

    /**
     * 分配 k 张 GPU 给任务，使用 SELECT FOR UPDATE 悲观锁
     * 保证多调度实例并发安全
     */
    @Transactional
    public List<GpuSlot> allocateGpuSlots(Long nodeId, int count, Long taskId) {
        // Check if task already has allocations (idempotent)
        List<GpuSlot> existing = gpuSlotRepository.findByAllocatedTaskId(taskId);
        if (!existing.isEmpty()) {
            log.info("Task {} already has {} GPU slots allocated, skipping", taskId, existing.size());
            return existing;
        }

        // Pessimistic lock: lock free slots for this node
        List<GpuSlot> freeSlots = gpuSlotRepository.findFreeSlotsByNodeForUpdate(nodeId);

        if (freeSlots.size() < count) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    String.format("节点 %d 空闲 GPU 不足：需要 %d，可用 %d", nodeId, count, freeSlots.size()));
        }

        // Select optimal slots (prefer consecutive for NVLink)
        List<GpuSlot> selected = selectOptimalSlots(freeSlots, count);

        for (GpuSlot slot : selected) {
            slot.setStatus("ALLOCATED");
            slot.setAllocatedTaskId(taskId);
            slot.setAllocatedAt(Instant.now());
        }
        gpuSlotRepository.saveAll(selected);

        log.info("Allocated {} GPU slots on node {} for task {}: indices {}",
                count, nodeId, taskId,
                selected.stream().map(s -> String.valueOf(s.getGpuIndex())).toList());
        return selected;
    }

    /**
     * 释放任务占用的 GPU slots
     */
    @Transactional
    public void releaseGpuSlots(Long taskId) {
        List<GpuSlot> allocated = gpuSlotRepository.findByAllocatedTaskId(taskId);
        if (allocated.isEmpty()) return;

        for (GpuSlot slot : allocated) {
            slot.setStatus("FREE");
            slot.setAllocatedTaskId(null);
            slot.setAllocatedAt(null);
        }
        gpuSlotRepository.saveAll(allocated);
        log.info("Released {} GPU slots for task {}", allocated.size(), taskId);
    }

    /**
     * 获取节点 GPU slot 状态
     */
    public List<GpuSlot> getNodeGpuSlots(Long nodeId) {
        return gpuSlotRepository.findByNodeIdOrderByGpuIndex(nodeId);
    }

    /**
     * 获取节点空闲 GPU 数
     */
    public long getFreeGpuCount(Long nodeId) {
        return gpuSlotRepository.countFreeByNodeId(nodeId);
    }

    /**
     * 选择最优的 k 张 GPU — 优先选连续编号（NVLink 拓扑邻近）
     */
    private List<GpuSlot> selectOptimalSlots(List<GpuSlot> freeSlots, int count) {
        // Try consecutive first
        for (int i = 0; i <= freeSlots.size() - count; i++) {
            boolean consecutive = true;
            for (int j = 1; j < count; j++) {
                if (freeSlots.get(i + j).getGpuIndex() != freeSlots.get(i).getGpuIndex() + j) {
                    consecutive = false;
                    break;
                }
            }
            if (consecutive) {
                return new ArrayList<>(freeSlots.subList(i, i + count));
            }
        }
        // Fallback: take first k by index
        return new ArrayList<>(freeSlots.subList(0, count));
    }

    /**
     * 孤儿 GPU slot 回收（任务已终态但 slot 未释放）
     * 每 5 分钟执行一次
     */
    @Scheduled(fixedRate = 300000)
    @Transactional
    public void reclaimOrphanSlots() {
        List<GpuSlot> allocatedSlots = gpuSlotRepository.findAllocatedSlots();
        int reclaimed = 0;

        for (GpuSlot slot : allocatedSlots) {
            if (slot.getAllocatedTaskId() == null) continue;

            var taskOpt = taskRepository.findById(slot.getAllocatedTaskId());
            if (taskOpt.isEmpty() || TERMINAL_STATUSES.contains(taskOpt.get().getStatus())) {
                slot.setStatus("FREE");
                slot.setAllocatedTaskId(null);
                slot.setAllocatedAt(null);
                gpuSlotRepository.save(slot);
                reclaimed++;
            }
        }

        if (reclaimed > 0) {
            log.info("Reclaimed {} orphan GPU slots", reclaimed);
        }
    }

    // ---- Slot counting methods for scheduler pre-check ----

    public long countFreeSlots(Long nodeId) {
        return gpuSlotRepository.findAll().stream()
                .filter(s -> s.getNodeId().equals(nodeId) && "FREE".equals(s.getStatus()))
                .count();
    }

    public long countTotalSlots(Long nodeId) {
        return gpuSlotRepository.findAll().stream()
                .filter(s -> s.getNodeId().equals(nodeId))
                .count();
    }
}
