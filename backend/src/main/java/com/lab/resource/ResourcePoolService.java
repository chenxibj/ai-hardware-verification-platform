package com.lab.resource;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class ResourcePoolService {

    private final ResourcePoolRepository repo;
    private final ComputeNodeRepository nodeRepo;
    private final ObjectMapper objectMapper;

    public ResourcePoolService(ResourcePoolRepository repo, ComputeNodeRepository nodeRepo, ObjectMapper objectMapper) {
        this.repo = repo;
        this.nodeRepo = nodeRepo;
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

            // Compute stats from associated nodes
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
        // Unlink all nodes from this pool
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
}
