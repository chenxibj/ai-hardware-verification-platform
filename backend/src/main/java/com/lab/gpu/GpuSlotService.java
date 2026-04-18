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

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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

    @PersistenceContext
    private EntityManager entityManager;

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

    /**
     * #478: 根据 Agent 上报的 GPU 信息，同步 gpu_slots 表
     * 策略：
     * - gpu_count == 0 → 不操作（CPU 节点）
     * - 已有 slot 数量匹配 → 只更新元信息（型号/显存）
     * - 数量不匹配 → 增量同步（保留 ALLOCATED slot，删除多余 FREE，补齐缺失）
     */
    @Transactional
    public void initializeSlots(Long nodeId, int gpuCount, List<Map<String, Object>> gpuDetails) {
        if (gpuCount <= 0) return;

        // #479: Advisory lock prevents concurrent register/heartbeat from creating duplicate slots
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(:nodeId)")
                .setParameter("nodeId", nodeId)
                .getSingleResult();

        List<GpuSlot> existing = gpuSlotRepository.findByNodeIdOrderByGpuIndex(nodeId);

        if (existing.size() == gpuCount) {
            // 数量一致，更新元信息
            for (GpuSlot slot : existing) {
                Map<String, Object> detail = findGpuByIndex(gpuDetails, slot.getGpuIndex());
                if (detail != null) {
                    updateSlotMetadata(slot, detail);
                }
            }
            gpuSlotRepository.saveAll(existing);
            log.info("GPU slots for node {} already match ({}), updated metadata", nodeId, gpuCount);
            return;
        }

        // 增量同步
        Set<Integer> existingIndices = existing.stream()
                .map(GpuSlot::getGpuIndex).collect(Collectors.toSet());

        // 删除多余的 FREE slot（缩容场景）
        for (GpuSlot slot : existing) {
            if (slot.getGpuIndex() >= gpuCount && "FREE".equals(slot.getStatus())) {
                gpuSlotRepository.delete(slot);
            }
        }

        // 创建缺失的 slot
        for (int i = 0; i < gpuCount; i++) {
            if (existingIndices.contains(i)) {
                // 更新已有 slot 的元信息
                final int gpuIdx = i;
                existing.stream().filter(s -> s.getGpuIndex() == gpuIdx).findFirst().ifPresent(slot -> {
                    Map<String, Object> detail = findGpuByIndex(gpuDetails, gpuIdx);
                    if (detail != null) updateSlotMetadata(slot, detail);
                    gpuSlotRepository.save(slot);
                });
                continue;
            }
            GpuSlot slot = new GpuSlot();
            slot.setNodeId(nodeId);
            slot.setGpuIndex(i);
            slot.setStatus("FREE");
            Map<String, Object> detail = findGpuByIndex(gpuDetails, i);
            if (detail != null) {
                updateSlotMetadata(slot, detail);
            }
            gpuSlotRepository.save(slot);
        }

        log.info("Synced GPU slots for node {}: {} slots (was {})", nodeId, gpuCount, existing.size());
    }

    private void updateSlotMetadata(GpuSlot slot, Map<String, Object> detail) {
        Object name = detail.get("name");
        if (name != null) slot.setGpuModel(String.valueOf(name));
        Object memMb = detail.get("memory_total_mb");
        if (memMb != null) {
            int mb = ((Number) memMb).intValue();
            slot.setGpuMemoryGb(mb / 1024);
        }
    }

    private Map<String, Object> findGpuByIndex(List<Map<String, Object>> gpus, int index) {
        if (gpus == null) return null;
        return gpus.stream()
                .filter(g -> {
                    Object idx = g.get("index");
                    return idx != null && ((Number) idx).intValue() == index;
                })
                .findFirst().orElse(null);
    }
}
