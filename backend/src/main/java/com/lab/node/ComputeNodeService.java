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
        // Filter by type (from tags or hardwareInfo) if provided
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

    @Transactional
    public ComputeNode register(ComputeNode node) {
        // Name uniqueness check
        if (repo.findByName(node.getName()).isPresent()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "节点名称已存在: " + node.getName());
        }
        // Auto-generate 32-char token stored in sshKey field (reuse for agent auth)
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
            // Check uniqueness if name changed
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
     * Scheduled task: mark nodes offline if no heartbeat in 5 minutes
     */
    @Scheduled(fixedRate = 60000) // every minute
    @Transactional
    public void checkOfflineNodes() {
        Instant threshold = Instant.now().minus(5, ChronoUnit.MINUTES);
        List<ComputeNode> onlineNodes = repo.findByStatus(ComputeNode.Status.ONLINE);
        for (ComputeNode node : onlineNodes) {
            if (node.getLastHeartbeat() == null || node.getLastHeartbeat().isBefore(threshold)) {
                node.setStatus(ComputeNode.Status.OFFLINE);
                repo.save(node);
            }
        }
        // Also check BUSY nodes
        List<ComputeNode> busyNodes = repo.findByStatus(ComputeNode.Status.BUSY);
        for (ComputeNode node : busyNodes) {
            if (node.getLastHeartbeat() == null || node.getLastHeartbeat().isBefore(threshold)) {
                node.setStatus(ComputeNode.Status.OFFLINE);
                repo.save(node);
            }
        }
    }
}
