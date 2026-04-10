package com.lab.node;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.k8s.K8sCluster;
import com.lab.k8s.K8sClusterRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(ComputeNodeService.class);

    private final ComputeNodeRepository repo;
    private final K8sClusterRepository clusterRepo;

    public ComputeNodeService(ComputeNodeRepository repo, K8sClusterRepository clusterRepo) {
        this.repo = repo;
        this.clusterRepo = clusterRepo;
    }

    /**
     * 节点列表 — 支持 source 和 clusterId 过滤
     */
    public List<ComputeNode> list(ComputeNode.Status status, String type, String source, Long clusterId) {
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
        if (source != null && !source.isBlank()) {
            nodes = nodes.stream()
                    .filter(n -> source.equalsIgnoreCase(n.getSource()))
                    .toList();
        }
        if (clusterId != null) {
            nodes = nodes.stream()
                    .filter(n -> clusterId.equals(n.getClusterId()))
                    .toList();
        }
        return nodes;
    }

    public List<ComputeNode> list(ComputeNode.Status status, String type) {
        return list(status, type, null, null);
    }

    public ComputeNode getById(Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "节点不存在: " + id));
    }

    @Transactional
    public ComputeNode register(ComputeNode node) {
        Optional<ComputeNode> existing = repo.findByName(node.getName());
        if (existing.isPresent()) {
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
        String token = UUID.randomUUID().toString().replace("-", "");
        node.setSshKey(token);
        if (node.getStatus() == null) {
            node.setStatus(ComputeNode.Status.OFFLINE);
        }
        if (node.getSource() == null) {
            node.setSource("manual");
        }
        return repo.save(node);
    }

    /**
     * 注册节点 — 支持 K8s 集群关联
     */
    @Transactional
    public ComputeNode registerWithCluster(ComputeNode node, Long clusterId, String clusterName) {
        // Resolve cluster
        if (clusterId == null && clusterName != null) {
            Optional<K8sCluster> clusterOpt = clusterRepo.findByName(clusterName);
            if (clusterOpt.isPresent()) {
                node.setClusterId(clusterOpt.get().getId());
            }
        } else if (clusterId != null) {
            node.setClusterId(clusterId);
        }

        if (node.getSource() == null && node.getClusterId() != null) {
            node.setSource("k8s-daemonset");
        }

        ComputeNode saved = register(node);

        // Ensure cluster fields are set on re-registered nodes too
        if (node.getClusterId() != null) {
            saved.setClusterId(node.getClusterId());
            saved.setSource(node.getSource() != null ? node.getSource() : "k8s-daemonset");
            saved = repo.save(saved);
        }

        return saved;
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
     * 心跳 — 支持集群关联
     */
    @Transactional
    public ComputeNode heartbeatWithCluster(Long id, String hardwareInfo, Long clusterId, String clusterName) {
        ComputeNode node = heartbeat(id, hardwareInfo);

        if (clusterId != null) {
            node.setClusterId(clusterId);
            node.setSource("k8s-daemonset");
            return repo.save(node);
        } else if (clusterName != null && node.getClusterId() == null) {
            Optional<K8sCluster> clusterOpt = clusterRepo.findByName(clusterName);
            if (clusterOpt.isPresent()) {
                node.setClusterId(clusterOpt.get().getId());
                node.setSource("k8s-daemonset");
                return repo.save(node);
            }
        }

        return node;
    }

    @Scheduled(fixedRate = 30000)
    @Transactional
    public void checkOfflineNodes() {
        Instant threshold = Instant.now().minus(2, ChronoUnit.MINUTES);
        List<ComputeNode> onlineNodes = repo.findByStatus(ComputeNode.Status.ONLINE);
        for (ComputeNode node : onlineNodes) {
            if (node.getLastHeartbeat() == null || node.getLastHeartbeat().isBefore(threshold)) {
                node.setStatus(ComputeNode.Status.OFFLINE);
                repo.save(node);
                log.debug("节点 {} 心跳超时，标记为 OFFLINE", node.getName());
            }
        }
        List<ComputeNode> busyNodes = repo.findByStatus(ComputeNode.Status.BUSY);
        for (ComputeNode node : busyNodes) {
            if (node.getLastHeartbeat() == null || node.getLastHeartbeat().isBefore(threshold)) {
                node.setStatus(ComputeNode.Status.OFFLINE);
                repo.save(node);
                log.debug("节点 {} 心跳超时，标记为 OFFLINE", node.getName());
            }
        }
    }
}
