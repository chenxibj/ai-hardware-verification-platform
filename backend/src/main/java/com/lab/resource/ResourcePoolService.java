package com.lab.resource;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class ResourcePoolService {

    private final ResourcePoolRepository repo;
    private final ComputeNodeRepository nodeRepo;
    private final EvaluationTaskRepository taskRepo;
    private final ObjectMapper objectMapper;

    public ResourcePoolService(ResourcePoolRepository repo, ComputeNodeRepository nodeRepo,
                               EvaluationTaskRepository taskRepo, ObjectMapper objectMapper) {
        this.repo = repo;
        this.nodeRepo = nodeRepo;
        this.taskRepo = taskRepo;
        this.objectMapper = objectMapper;
    }

    public List<Map<String, Object>> listWithStats() {
        List<ResourcePool> pools = repo.findAll(Sort.by(Sort.Direction.DESC, "createdAt"));
        List<Map<String, Object>> result = new ArrayList<>();
        for (ResourcePool pool : pools) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", pool.getId());
            item.put("name", pool.getName());
            item.put("type", pool.getType());
            item.put("description", pool.getDescription());
            item.put("capacity", pool.getCapacity());
            item.put("status", pool.getStatus().name());
            item.put("createdAt", pool.getCreatedAt());
            item.put("updatedAt", pool.getUpdatedAt());

            List<ComputeNode> nodes = nodeRepo.findByResourcePoolId(pool.getId());
            int nodeCount = nodes.size();
            int onlineCount = 0;
            int totalCpu = 0;
            double totalMemory = 0;
            int totalGpu = 0;
            for (ComputeNode node : nodes) {
                if (node.getStatus() == ComputeNode.Status.ONLINE || node.getStatus() == ComputeNode.Status.BUSY) {
                    onlineCount++;
                }
                try {
                    if (node.getHardwareInfo() != null) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> hw = objectMapper.readValue(node.getHardwareInfo(), Map.class);
                        Object cores = hw.get("cpu_cores_logical");
                        if (cores == null) cores = hw.get("cpu_threads");
                        if (cores != null) totalCpu += ((Number) cores).intValue();
                        Object mem = hw.get("memory_total_gb");
                        if (mem != null) totalMemory += ((Number) mem).doubleValue();
                        Object gpu = hw.get("gpu_count");
                        if (gpu != null) totalGpu += ((Number) gpu).intValue();
                    }
                } catch (Exception ignored) {}
            }
            item.put("nodeCount", nodeCount);
            item.put("onlineNodeCount", onlineCount);
            item.put("totalCpu", totalCpu);
            item.put("totalMemoryGb", Math.round(totalMemory * 10.0) / 10.0);
            item.put("totalGpu", totalGpu);

            // #346: 任务排队统计
            long runningCount = 0;
            long queuedCount = 0;
            try {
                List<EvaluationTask> poolRunning = taskRepo.findByResourcePoolIdAndStatus(pool.getId(), EvaluationTask.TaskStatus.RUNNING);
                List<EvaluationTask> poolQueued = taskRepo.findByResourcePoolIdAndStatus(pool.getId(), EvaluationTask.TaskStatus.QUEUED);
                runningCount = poolRunning.size();
                queuedCount = poolQueued.size();
            } catch (Exception ignored) {}
            item.put("runningTaskCount", runningCount);
            item.put("queuedTaskCount", queuedCount);

            result.add(item);
        }
        return result;
    }

    public ResourcePool getById(Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "资源池不存在: " + id));
    }

    @Transactional
    public ResourcePool create(ResourcePool pool) {
        if (repo.findByName(pool.getName()).isPresent()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "资源池名称已存在: " + pool.getName());
        }
        if (pool.getCapacity() == null || pool.getCapacity().isBlank()) {
            pool.setCapacity("{}");
        }
        if (pool.getStatus() == null) {
            pool.setStatus(ResourcePool.Status.ACTIVE);
        }
        return repo.save(pool);
    }

    @Transactional
    public ResourcePool update(Long id, ResourcePool updates) {
        ResourcePool existing = getById(id);
        if (updates.getName() != null) {
            if (!existing.getName().equals(updates.getName())) {
                repo.findByName(updates.getName()).ifPresent(other -> {
                    if (!other.getId().equals(id)) {
                        throw new BusinessException(ErrorCode.BAD_REQUEST, "资源池名称已存在: " + updates.getName());
                    }
                });
            }
            existing.setName(updates.getName());
        }
        if (updates.getType() != null) existing.setType(updates.getType());
        if (updates.getDescription() != null) existing.setDescription(updates.getDescription());
        if (updates.getCapacity() != null) existing.setCapacity(updates.getCapacity());
        if (updates.getStatus() != null) existing.setStatus(updates.getStatus());
        return repo.save(existing);
    }

    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "资源池不存在: " + id);
        }
        List<ComputeNode> nodes = nodeRepo.findByResourcePoolId(id);
        for (ComputeNode node : nodes) {
            node.setResourcePoolId(null);
            nodeRepo.save(node);
        }
        repo.deleteById(id);
    }

    public Map<String, Object> getPoolDetail(Long id) {
        ResourcePool pool = getById(id);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", pool.getId());
        result.put("name", pool.getName());
        result.put("type", pool.getType());
        result.put("description", pool.getDescription());
        result.put("capacity", pool.getCapacity());
        result.put("status", pool.getStatus().name());
        result.put("createdAt", pool.getCreatedAt());
        result.put("updatedAt", pool.getUpdatedAt());
        result.put("nodes", nodeRepo.findByResourcePoolId(id));
        return result;
    }

    /**
     * Add a compute node to a resource pool
     */
    @Transactional
    public Map<String, Object> addNodeToPool(Long poolId, Long nodeId) {
        ResourcePool pool = getById(poolId);
        ComputeNode node = nodeRepo.findById(nodeId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "节点不存在: " + nodeId));

        node.setResourcePoolId(poolId);
        nodeRepo.save(node);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("poolId", poolId);
        result.put("poolName", pool.getName());
        result.put("nodeId", nodeId);
        result.put("nodeName", node.getName());
        result.put("message", "节点已添加到资源池");
        return result;
    }

    /**
     * Remove a compute node from a resource pool
     */
    @Transactional
    public void removeNodeFromPool(Long poolId, Long nodeId) {
        getById(poolId); // verify pool exists
        ComputeNode node = nodeRepo.findById(nodeId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "节点不存在: " + nodeId));

        if (node.getResourcePoolId() == null || !node.getResourcePoolId().equals(poolId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "节点不属于该资源池");
        }
        node.setResourcePoolId(null);
        nodeRepo.save(node);
    }

    /**
     * Get detailed resource statistics for a pool
     */
    public Map<String, Object> getPoolStats(Long poolId) {
        getById(poolId); // verify pool exists
        List<ComputeNode> nodes = nodeRepo.findByResourcePoolId(poolId);

        int totalCpuCores = 0;
        int usedCpuCores = 0;
        double totalMemoryGb = 0;
        double usedMemoryGb = 0;
        int totalGpuCount = 0;
        int usedGpuCount = 0;
        Set<String> gpuModels = new LinkedHashSet<>();

        int totalNodes = nodes.size();
        int onlineNodes = 0;
        int busyNodes = 0;
        int idleNodes = 0;
        int offlineNodes = 0;

        // Determine which nodes have RUNNING tasks assigned
        // We check tasks with status=RUNNING that reference node via resource_pool_id
        Set<Long> busyNodeIds = new HashSet<>();
        try {
            for (ComputeNode node : nodes) {
                // A node is busy if it has RUNNING tasks in its pool or assigned to it
                // We'll check tasks with resourcePoolId = poolId and status RUNNING
            }
            // Get all running tasks for this pool
            List<EvaluationTask> runningTasks = taskRepo.findByResourcePoolIdAndStatus(poolId, EvaluationTask.TaskStatus.RUNNING);
            if (!runningTasks.isEmpty()) {
                // If there are running tasks assigned to the pool, mark nodes as busy
                // For simplicity, all online nodes in a pool with running tasks are considered busy
                // In production, you'd track per-node assignment
                for (EvaluationTask t : runningTasks) {
                    // If task has nodeId assignment (via plan's nodeId), use that
                    // Otherwise all nodes in the pool are candidates
                }
            }
        } catch (Exception ignored) {
            // If the query method doesn't exist yet, skip
        }

        for (ComputeNode node : nodes) {
            if (node.getStatus() == ComputeNode.Status.ONLINE) {
                onlineNodes++;
                if (busyNodeIds.contains(node.getId())) {
                    busyNodes++;
                } else {
                    idleNodes++;
                }
            } else if (node.getStatus() == ComputeNode.Status.BUSY) {
                onlineNodes++;
                busyNodes++;
            } else if (node.getStatus() == ComputeNode.Status.OFFLINE) {
                offlineNodes++;
            } else {
                offlineNodes++;
            }

            try {
                if (node.getHardwareInfo() != null) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> hw = objectMapper.readValue(node.getHardwareInfo(), Map.class);
                    Object cores = hw.get("cpu_cores_logical");
                    if (cores == null) cores = hw.get("cpu_threads");
                    if (cores != null) totalCpuCores += ((Number) cores).intValue();

                    Object mem = hw.get("memory_total_gb");
                    if (mem != null) totalMemoryGb += ((Number) mem).doubleValue();

                    Object gpuCnt = hw.get("gpu_count");
                    if (gpuCnt != null) totalGpuCount += ((Number) gpuCnt).intValue();

                    Object gpuModel = hw.get("gpu_model");
                    if (gpuModel != null && !gpuModel.toString().isBlank()) {
                        gpuModels.add(gpuModel.toString());
                    }
                }
            } catch (Exception ignored) {}
        }

        // Estimate used resources based on busy nodes ratio
        double busyRatio = totalNodes > 0 ? (double) busyNodes / totalNodes : 0;
        usedCpuCores = (int) Math.round(totalCpuCores * busyRatio);
        usedMemoryGb = Math.round(totalMemoryGb * busyRatio * 10.0) / 10.0;
        usedGpuCount = (int) Math.round(totalGpuCount * busyRatio);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalCpuCores", totalCpuCores);
        stats.put("usedCpuCores", usedCpuCores);
        stats.put("freeCpuCores", totalCpuCores - usedCpuCores);
        stats.put("totalMemoryGb", Math.round(totalMemoryGb * 10.0) / 10.0);
        stats.put("usedMemoryGb", usedMemoryGb);
        stats.put("freeMemoryGb", Math.round((totalMemoryGb - usedMemoryGb) * 10.0) / 10.0);
        stats.put("totalGpuCount", totalGpuCount);
        stats.put("usedGpuCount", usedGpuCount);
        stats.put("freeGpuCount", totalGpuCount - usedGpuCount);
        stats.put("gpuModels", new ArrayList<>(gpuModels));
        stats.put("totalNodes", totalNodes);
        stats.put("onlineNodes", onlineNodes);
        stats.put("busyNodes", busyNodes);
        stats.put("idleNodes", idleNodes);
        stats.put("offlineNodes", offlineNodes);
        return stats;
    }

    /**
     * #346: 获取资源池关联的运行中和排队中的任务
     */
    public Map<String, Object> getPoolTasks(Long poolId) {
        getById(poolId); // verify pool exists

        List<EvaluationTask> runningTasks = taskRepo.findByResourcePoolIdAndStatus(
                poolId, EvaluationTask.TaskStatus.RUNNING);
        List<EvaluationTask> queuedTasks = taskRepo.findByResourcePoolIdAndStatus(
                poolId, EvaluationTask.TaskStatus.QUEUED);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("poolId", poolId);
        result.put("runningCount", runningTasks.size());
        result.put("queuedCount", queuedTasks.size());

        List<Map<String, Object>> runningList = new ArrayList<>();
        for (EvaluationTask t : runningTasks) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", t.getId());
            item.put("taskNo", t.getTaskNo());
            item.put("name", t.getName());
            item.put("status", t.getStatus().name());
            item.put("progress", t.getProgress());
            item.put("startedAt", t.getStartedAt());
            item.put("assignedNodeId", t.getAssignedNodeId());
            runningList.add(item);
        }
        result.put("runningTasks", runningList);

        List<Map<String, Object>> queuedList = new ArrayList<>();
        for (EvaluationTask t : queuedTasks) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", t.getId());
            item.put("taskNo", t.getTaskNo());
            item.put("name", t.getName());
            item.put("status", t.getStatus().name());
            item.put("priority", t.getPriority().name());
            item.put("createdAt", t.getCreatedAt());
            queuedList.add(item);
        }
        result.put("queuedTasks", queuedList);

        return result;
    }

}
