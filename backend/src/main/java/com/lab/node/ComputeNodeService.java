package com.lab.node;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class ComputeNodeService {

    private final ComputeNodeRepository repo;

    public ComputeNodeService(ComputeNodeRepository repo) {
        this.repo = repo;
    }

    public List<ComputeNode> list(ComputeNode.Status status, String type) {
        List<ComputeNode> nodes;
        if (status != null) {
            nodes = repo.findByStatus(status);
        } else {
            nodes = repo.findAll(Sort.by(Sort.Direction.DESC, "createdAt"));
        }
        if (type != null && !type.isBlank()) {
            nodes = nodes.stream()
                    .filter(n -> n.getTags() != null && n.getTags().toUpperCase().contains(type.toUpperCase()))
                    .toList();
        }
        return nodes;
    }

    public ComputeNode getById(Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "节点不存在: " + id));
    }

    /**
     * 注册节点 - 支持重复注册（幂等）
     * 如果同名节点已存在，更新硬件信息并返回
     */
    @Transactional
    public ComputeNode register(ComputeNode node) {
        Optional<ComputeNode> existing = repo.findByName(node.getName());
        if (existing.isPresent()) {
            // Re-registration: update hardware info and bring online
            ComputeNode ex = existing.get();
            if (node.getHardwareInfo() != null) ex.setHardwareInfo(node.getHardwareInfo());
            if (node.getDescription() != null) ex.setDescription(node.getDescription());
            if (node.getTags() != null) ex.setTags(node.getTags());
            if (node.getAgentPort() != null) ex.setAgentPort(node.getAgentPort());
            ex.setStatus(ComputeNode.Status.ONLINE);
            ex.setLastHeartbeat(Instant.now());
            ex.setErrorMessage(null);
            return repo.save(ex);
        }
        // New registration
        String token = UUID.randomUUID().toString().replace("-", "");
        node.setSshKey(token);
        if (node.getStatus() == null) {
            node.setStatus(ComputeNode.Status.OFFLINE);
        }
        return repo.save(node);
    }

    @Transactional
    public ComputeNode update(Long id, ComputeNode updates) {
        ComputeNode existing = getById(id);
        if (updates.getName() != null) {
            if (!existing.getName().equals(updates.getName())) {
                repo.findByName(updates.getName()).ifPresent(other -> {
                    if (!other.getId().equals(id)) {
                        throw new BusinessException(ErrorCode.BAD_REQUEST, "节点名称已存在: " + updates.getName());
                    }
                });
            }
            existing.setName(updates.getName());
        }
        if (updates.getIpAddress() != null) existing.setIpAddress(updates.getIpAddress());
        if (updates.getAgentPort() != null) existing.setAgentPort(updates.getAgentPort());
        if (updates.getDescription() != null) existing.setDescription(updates.getDescription());
        if (updates.getTags() != null) existing.setTags(updates.getTags());
        if (updates.getHardwareInfo() != null) existing.setHardwareInfo(updates.getHardwareInfo());
        if (updates.getStatus() != null) existing.setStatus(updates.getStatus());
        if (updates.getSshUser() != null) existing.setSshUser(updates.getSshUser());
        if (updates.getSshPort() != null) existing.setSshPort(updates.getSshPort());
        return repo.save(existing);
    }

    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "节点不存在: " + id);
        }
        repo.deleteById(id);
    }

    @Transactional
    public ComputeNode heartbeat(Long id, String hardwareInfo) {
        ComputeNode node = getById(id);
        node.setLastHeartbeat(Instant.now());
        node.setStatus(ComputeNode.Status.ONLINE);
        node.setErrorMessage(null);
        if (hardwareInfo != null && !hardwareInfo.isBlank()) {
            node.setHardwareInfo(hardwareInfo);
        }
        return repo.save(node);
    }

    /**
     * Scheduled task: mark nodes offline if no heartbeat in 2 minutes (PRD v2.0)
     */
    @Scheduled(fixedRate = 30000)
    @Transactional
    public void checkOfflineNodes() {
        Instant threshold = Instant.now().minus(2, ChronoUnit.MINUTES);
        List<ComputeNode> onlineNodes = repo.findByStatus(ComputeNode.Status.ONLINE);
        for (ComputeNode node : onlineNodes) {
            if (node.getLastHeartbeat() == null || node.getLastHeartbeat().isBefore(threshold)) {
                node.setStatus(ComputeNode.Status.OFFLINE);
                repo.save(node);
            }
        }
        List<ComputeNode> busyNodes = repo.findByStatus(ComputeNode.Status.BUSY);
        for (ComputeNode node : busyNodes) {
            if (node.getLastHeartbeat() == null || node.getLastHeartbeat().isBefore(threshold)) {
                node.setStatus(ComputeNode.Status.OFFLINE);
                repo.save(node);
            }
        }
    }
}
