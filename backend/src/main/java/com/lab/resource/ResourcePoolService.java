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

/**
 * 资源池服务
 * @feat #175
 */
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

    @Transactional
    public ResourcePool create(ResourcePoolRequest request) {
        ResourcePool pool = new ResourcePool();
        pool.setName(request.getName());
        pool.setDescription(request.getDescription());
        pool.setType(request.getStrategy() != null ? request.getStrategy() : "round_robin");
        pool.setStatus(ResourcePool.Status.ACTIVE);

        // Store node_ids and tenant_binding in capacity JSON
        try {
            Map<String, Object> cap = new LinkedHashMap<>();
            cap.put("strategy", request.getStrategy() != null ? request.getStrategy() : "round_robin");
            cap.put("node_ids", request.getNodeIds() != null ? request.getNodeIds() : List.of());
            cap.put("tenant_binding", request.getTenantBinding());
            pool.setCapacity(objectMapper.writeValueAsString(cap));
        } catch (Exception e) {
            pool.setCapacity("{}");
        }

        return repo.save(pool);
    }

    public List<ResourcePool> list(String status) {
        if (status != null && !status.isBlank()) {
            try {
                return repo.findByStatus(ResourcePool.Status.valueOf(status.toUpperCase()));
            } catch (IllegalArgumentException ignored) {}
        }
        return repo.findAll(Sort.by(Sort.Direction.DESC, "createdAt"));
    }

    public ResourcePool getById(Long id) {
        return repo.findById(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "资源池不存在: " + id));
    }

    @Transactional
    public ResourcePool update(Long id, ResourcePoolRequest request) {
        ResourcePool pool = getById(id);
        if (request.getName() != null) pool.setName(request.getName());
        if (request.getDescription() != null) pool.setDescription(request.getDescription());
        if (request.getStrategy() != null) pool.setType(request.getStrategy());
        if (request.getStatus() != null) {
            try {
                pool.setStatus(ResourcePool.Status.valueOf(request.getStatus().toUpperCase()));
            } catch (IllegalArgumentException ignored) {}
        }

        try {
            Map<String, Object> cap = pool.getCapacity() != null
                ? objectMapper.readValue(pool.getCapacity(), Map.class) : new LinkedHashMap<>();
            Map<String, Object> newCap = new LinkedHashMap<>(cap);
            if (request.getStrategy() != null) newCap.put("strategy", request.getStrategy());
            if (request.getNodeIds() != null) newCap.put("node_ids", request.getNodeIds());
            if (request.getTenantBinding() != null) newCap.put("tenant_binding", request.getTenantBinding());
            pool.setCapacity(objectMapper.writeValueAsString(newCap));
        } catch (Exception ignored) {}

        return repo.save(pool);
    }

    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "资源池不存在: " + id);
        }
        repo.deleteById(id);
    }

    @Transactional
    public ResourcePool assignNodes(Long poolId, List<Long> nodeIds) {
        ResourcePool pool = getById(poolId);
        // Validate node ids exist
        for (Long nid : nodeIds) {
            if (!nodeRepo.existsById(nid)) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "节点不存在: " + nid);
            }
        }

        try {
            Map<String, Object> cap = pool.getCapacity() != null
                ? objectMapper.readValue(pool.getCapacity(), Map.class) : new LinkedHashMap<>();
            Map<String, Object> newCap = new LinkedHashMap<>(cap);
            newCap.put("node_ids", nodeIds);
            pool.setCapacity(objectMapper.writeValueAsString(newCap));
        } catch (Exception ignored) {}

        return repo.save(pool);
    }
}
