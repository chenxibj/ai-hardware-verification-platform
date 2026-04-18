package com.lab.node;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.k8s.K8sCluster;
import com.lab.k8s.K8sClusterRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import com.lab.gpu.GpuSlotService;
import com.lab.task.TaskDispatcher;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Service
public class ComputeNodeService {

    private static final Logger log = LoggerFactory.getLogger(ComputeNodeService.class);

    private final ComputeNodeRepository repo;
    private final K8sClusterRepository clusterRepo;
    private final TaskDispatcher taskDispatcher;
    private final ObjectMapper objectMapper;
    private final GpuSlotService gpuSlotService;

    public ComputeNodeService(ComputeNodeRepository repo, K8sClusterRepository clusterRepo,
                              @Lazy TaskDispatcher taskDispatcher, ObjectMapper objectMapper,
                              GpuSlotService gpuSlotService) {
        this.repo = repo;
        this.clusterRepo = clusterRepo;
        this.taskDispatcher = taskDispatcher;
        this.objectMapper = objectMapper;
        this.gpuSlotService = gpuSlotService;
    }

    /**
     * 从 hardwareInfo JSON 中解析 GPU 型号
     */
    private String extractGpuNameFromHardwareInfo(String hardwareInfo) {
        if (hardwareInfo == null || hardwareInfo.isBlank()) return null;
        try {
            JsonNode root = objectMapper.readTree(hardwareInfo);
            JsonNode gpuName = root.get("gpu_name");
            if (gpuName != null && !gpuName.isNull() && !gpuName.asText().isBlank()) {
                return gpuName.asText();
            }
        } catch (Exception e) {
            log.debug("Failed to parse hardwareInfo for GPU name: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 更新节点的 chipModel：优先使用显式传入值，其次从 hardwareInfo 解析
     */
    private void updateChipModel(ComputeNode node, String explicitChipModel) {
        if (explicitChipModel != null && !explicitChipModel.isBlank()) {
            node.setChipModel(explicitChipModel);
        } else if (node.getChipModel() == null || node.getChipModel().isBlank()) {
            // Try to extract from hardwareInfo
            String gpuName = extractGpuNameFromHardwareInfo(node.getHardwareInfo());
            if (gpuName != null) {
                node.setChipModel(gpuName);
            }
        }
    }

    /**
     * #352: 检测 loopback IP 并记录警告
     */
    private boolean isLoopbackIp(String ip) {
        return "127.0.0.1".equals(ip) || "localhost".equals(ip);
    }

    /**
     * #351: 校验 IP 是否有效（非 null、非空、非 loopback）
     */
    private boolean isValidIp(String ip) {
        return ip != null && !ip.isBlank() && !isLoopbackIp(ip);
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
        // #351: 非 K8s 来源注册时校验 ipAddress 不为空
        if (!"k8s-daemonset".equals(node.getSource()) && !"k8s-discovery".equals(node.getSource())) {
            if (node.getIpAddress() == null || node.getIpAddress().isBlank()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "节点注册时 ipAddress 不能为空");
            }
        }

        // #352: 检测 loopback IP 并 log 警告
        if (node.getIpAddress() != null && isLoopbackIp(node.getIpAddress())) {
            log.warn("节点 {} 注册时使用了 loopback IP: {}，该节点将无法被调度分发任务",
                    node.getName(), node.getIpAddress());
        }

        Optional<ComputeNode> existing = repo.findByName(node.getName());
        // Problem 6 fix: also check by IP+clusterId to avoid duplicate nodes
        if (existing.isEmpty() && node.getIpAddress() != null && node.getClusterId() != null) {
            existing = repo.findByIpAddressAndClusterId(node.getIpAddress(), node.getClusterId());
        }
        if (existing.isPresent()) {
            ComputeNode ex = existing.get();
            if (node.getHardwareInfo() != null) ex.setHardwareInfo(node.getHardwareInfo());
            if (node.getDescription() != null) ex.setDescription(node.getDescription());
            if (node.getTags() != null) ex.setTags(node.getTags());
            if (node.getAgentPort() != null) ex.setAgentPort(node.getAgentPort());
            if (node.getIpAddress() != null && !node.getIpAddress().isBlank()) ex.setIpAddress(node.getIpAddress());
            if (node.getClusterId() != null) ex.setClusterId(node.getClusterId());
            if (node.getSource() != null) ex.setSource(node.getSource());
            // #478: Update gpuCount
            if (node.getGpuCount() != null && node.getGpuCount() > 0) ex.setGpuCount(node.getGpuCount());
            // Update chipModel
            updateChipModel(ex, node.getChipModel());
            // #351: 心跳更新时，只有 IP 有效才设为 ONLINE
            if (isValidIp(node.getIpAddress()) || isValidIp(ex.getIpAddress())) {
                ex.setStatus(ComputeNode.Status.ONLINE);
            } else {
                log.warn("节点 {} IP 无效 (ip={}), 不设为 ONLINE，保持 {}",
                        ex.getName(), ex.getIpAddress(), ex.getStatus());
            }
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
        // Set chipModel from hardwareInfo if not explicitly set
        updateChipModel(node, node.getChipModel());
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
        ComputeNode.Status oldStatus = node.getStatus();

        // #352: 检测 loopback IP 并 log 警告
        if (node.getIpAddress() != null && isLoopbackIp(node.getIpAddress())) {
            log.warn("节点 {} (id={}) 心跳时检测到 loopback IP: {}，该节点将无法被调度分发任务",
                    node.getName(), node.getId(), node.getIpAddress());
        }

        node.setLastHeartbeat(Instant.now());
        // #351: 心跳时只有 IP 有效才设为 ONLINE
        if (isValidIp(node.getIpAddress())) {
            node.setStatus(ComputeNode.Status.ONLINE);
        } else {
            log.warn("节点 {} (id={}) IP 无效 (ip={}), 心跳不设为 ONLINE",
                    node.getName(), node.getId(), node.getIpAddress());
        }
        node.setErrorMessage(null);
        node.setConsecutiveUnreachableCount(0); // #393: 心跳正常，重置不可达计数
        if (hardwareInfo != null && !hardwareInfo.isBlank()) {
            node.setHardwareInfo(hardwareInfo);
        }
        // Update chipModel from hardwareInfo if not already set
        updateChipModel(node, null);
        ComputeNode saved = repo.save(node);

        // 事件驱动：节点从 OFFLINE 恢复为 ONLINE 时，尝试分发排队任务
        if (oldStatus == ComputeNode.Status.OFFLINE && saved.getStatus() == ComputeNode.Status.ONLINE) {
            log.info("Node {} recovered from OFFLINE, triggering queue dispatch", saved.getName());
            try {
                taskDispatcher.tryDispatchNext();
            } catch (Exception e) {
                log.debug("Heartbeat-triggered dispatch failed: {}", e.getMessage());
            }
        }

        return saved;
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

    /**
     * #393: 检测 Agent 是否可达（2秒超时）
     */
    private boolean isAgentReachable(ComputeNode node) {
        if (node.getIpAddress() == null || node.getAgentPort() == null) return false;
        String url = "http://" + node.getIpAddress() + ":" + node.getAgentPort() + "/status";
        try {
            var factory = new SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(2000);
            factory.setReadTimeout(2000);
            var rt = new RestTemplate(factory);
            ResponseEntity<String> resp = rt.getForEntity(url, String.class);
            return resp.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            return false;
        }
    }

    private static final int UNREACHABLE_THRESHOLD = 3;

    /**
     * #478: 从注册数据中同步 GPU Slots
     */
    public void syncGpuSlotsFromRegistration(ComputeNode savedNode, Integer gpuCount, List<Map<String, Object>> gpuDetails) {
        if (gpuCount == null || gpuCount <= 0) {
            // Try to parse from hardwareInfo
            try {
                if (savedNode.getHardwareInfo() != null) {
                    JsonNode root = objectMapper.readTree(savedNode.getHardwareInfo());
                    if (root.has("gpu_count")) {
                        gpuCount = root.get("gpu_count").asInt(0);
                    }
                    if (gpuCount > 0 && (gpuDetails == null || gpuDetails.isEmpty()) && root.has("gpus") && root.get("gpus").isArray()) {
                        gpuDetails = new ArrayList<>();
                        for (JsonNode gpu : root.get("gpus")) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> detail = objectMapper.convertValue(gpu, Map.class);
                            gpuDetails.add(detail);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to parse GPU info from hardwareInfo for node {}: {}", savedNode.getId(), e.getMessage());
            }
        }

        if (gpuCount != null && gpuCount > 0) {
            savedNode.setGpuCount(gpuCount);
            repo.save(savedNode);
            gpuSlotService.initializeSlots(savedNode.getId(), gpuCount, gpuDetails);
            log.info("Node {} registered with {} GPUs, slots initialized", savedNode.getName(), gpuCount);
        }
    }

    /**
     * #478: 心跳时更新 GPU 实时信息
     */
    @SuppressWarnings("unchecked")
    public void updateGpuFromHeartbeat(ComputeNode node, Map<String, Object> metrics) {
        if (metrics == null) return;
        Object gpuCountObj = metrics.get("gpu_count");
        if (gpuCountObj == null) return;
        
        int reportedGpuCount = ((Number) gpuCountObj).intValue();
        if (reportedGpuCount <= 0) return;
        
        Integer currentGpuCount = node.getGpuCount();
        if (currentGpuCount == null || currentGpuCount != reportedGpuCount) {
            node.setGpuCount(reportedGpuCount);
            repo.save(node);
            
            List<Map<String, Object>> gpuDetails = null;
            Object gpusObj = metrics.get("gpus");
            if (gpusObj instanceof List) {
                gpuDetails = (List<Map<String, Object>>) gpusObj;
            }
            gpuSlotService.initializeSlots(node.getId(), reportedGpuCount, gpuDetails);
            log.info("Node {} gpu_count changed to {}, slots re-synced", node.getName(), reportedGpuCount);
        }
    }

    /**
     * #493: 释放节点 BUSY → ONLINE（公共方法，供 TaskLifecycleService 等调用）
     * @return true if the node was BUSY and has been released to ONLINE
     */
    @Transactional
    public boolean releaseIfBusy(Long nodeId) {
        return repo.findById(nodeId).map(node -> {
            if (node.getStatus() == ComputeNode.Status.BUSY) {
                node.setStatus(ComputeNode.Status.ONLINE);
                repo.save(node);
                log.info("Node {} released BUSY -> ONLINE", node.getName());
                return true;
            }
            return false;
        }).orElse(false);
    }

    /**
     * TODO #493: 多实例部署时需要 @SchedulerLock 防止并发执行（同 recoverTasks 注释）
     */
    @Scheduled(fixedRate = 30000)
    @Transactional
    public void checkOfflineNodes() {
        Instant threshold = Instant.now().minus(2, ChronoUnit.MINUTES);
        List<ComputeNode> onlineNodes = repo.findByStatus(ComputeNode.Status.ONLINE);
        for (ComputeNode node : onlineNodes) {
            if (node.getLastHeartbeat() == null || node.getLastHeartbeat().isBefore(threshold)) {
                node.setStatus(ComputeNode.Status.OFFLINE);
                node.setConsecutiveUnreachableCount(0);
                repo.save(node);
                log.debug("节点 {} 心跳超时，标记为 OFFLINE", node.getName());
            } else {
                // Pull-based dispatch: 心跳正常 = 节点在线
                // 不再检查 Agent HTTP 端口可达性（Agent 通过心跳主动拉任务，Server 不需要推送）
                if (node.getConsecutiveUnreachableCount() != null && node.getConsecutiveUnreachableCount() > 0) {
                    node.setConsecutiveUnreachableCount(0);
                    node.setErrorMessage(null);
                    repo.save(node);
                    log.debug("节点 {} 心跳正常，重置不可达计数", node.getName());
                }
                // 以下为旧代码（已禁用）: Agent 直连检查
                if (false && !"k8s-daemonset".equals(node.getSource()) && isValidIp(node.getIpAddress())) {
                    if (!isAgentReachable(node)) {
                        int count = (node.getConsecutiveUnreachableCount() != null ? node.getConsecutiveUnreachableCount() : 0) + 1;
                        node.setConsecutiveUnreachableCount(count);
                        if (count >= UNREACHABLE_THRESHOLD) {
                            node.setStatus(ComputeNode.Status.OFFLINE);
                            node.setErrorMessage(String.format("连续 %d 次不可达，自动标记 OFFLINE", count));
                            log.warn("节点 {} 连续 {} 次不可达，自动标记为 OFFLINE", node.getName(), count);
                        } else {
                            log.debug("节点 {} 不可达（第 {}/{} 次）", node.getName(), count, UNREACHABLE_THRESHOLD);
                        }
                        repo.save(node);
                    } else {
                        if (node.getConsecutiveUnreachableCount() != null && node.getConsecutiveUnreachableCount() > 0) {
                            node.setConsecutiveUnreachableCount(0);
                            repo.save(node);
                        }
                    }
                }
            }
        }
        List<ComputeNode> busyNodes = repo.findByStatus(ComputeNode.Status.BUSY);
        for (ComputeNode node : busyNodes) {
            if (node.getLastHeartbeat() == null || node.getLastHeartbeat().isBefore(threshold)) {
                node.setStatus(ComputeNode.Status.OFFLINE);
                node.setConsecutiveUnreachableCount(0);
                repo.save(node);
                log.debug("节点 {} 心跳超时，标记为 OFFLINE", node.getName());
            }
        }
    }
}
