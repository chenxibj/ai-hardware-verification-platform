package com.lab.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.*;

/**
 * 评测任务分发引擎
 * 负责将 PENDING 状态的 Task 分发到 ONLINE 的 Agent 节点执行
 * #222, #346: 增加资源池感知 + QUEUED 排队机制
 * #349: 校验节点 IP 有效性
 * #350: Plan 指定 nodeId 时优先分发到该节点
 */
@Slf4j
@Service
public class TaskDispatcher {

    private final EvaluationTaskRepository taskRepository;
    private final ComputeNodeRepository nodeRepository;
    private final EvaluationPlanRepository planRepository;
    private final ChipRepository chipRepository;
    private final ObjectMapper objectMapper;

    @Value("${agent.token:ahvp-agent-secret-2026}")
    private String agentToken;

    private final RestTemplate restTemplate = new RestTemplate();

    public TaskDispatcher(EvaluationTaskRepository taskRepository,
                          ComputeNodeRepository nodeRepository,
                          EvaluationPlanRepository planRepository,
                          ChipRepository chipRepository,
                          ObjectMapper objectMapper) {
        this.taskRepository = taskRepository;
        this.nodeRepository = nodeRepository;
        this.planRepository = planRepository;
        this.chipRepository = chipRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 分发指定 Plan 下所有 PENDING 的 Task
     */
    public void dispatchPlanTasks(Long planId) {
        List<EvaluationTask> pendingTasks = taskRepository.findByPlanIdAndStatus(
                planId, EvaluationTask.TaskStatus.PENDING);

        if (pendingTasks.isEmpty()) {
            log.info("Plan {} has no PENDING tasks to dispatch", planId);
            return;
        }

        log.info("Dispatching {} PENDING tasks for plan {}", pendingTasks.size(), planId);

        for (EvaluationTask task : pendingTasks) {
            try {
                dispatchSingleTask(task);
            } catch (Exception e) {
                log.error("Failed to dispatch task {} ({}): {}", task.getId(), task.getTaskNo(), e.getMessage());
            }
        }
    }

    /**
     * 分发单个任务到可用节点
     * #346: 当无可用节点时，任务状态设为 QUEUED 而非保持 PENDING
     */
    public boolean dispatchSingleTask(EvaluationTask task) {
        // 1. 找到一个可用节点 (ONLINE 且非 BUSY)，优先从资源池内查找
        ComputeNode node = findAvailableNode(task);
        if (node == null) {
            // #346: 无可用节点 → 任务进入排队状态
            if (task.getStatus() != EvaluationTask.TaskStatus.QUEUED) {
                task.setStatus(EvaluationTask.TaskStatus.QUEUED);
                taskRepository.save(task);
                log.info("No available node for task {} ({}), status set to QUEUED",
                        task.getId(), task.getTaskNo());
            } else {
                log.debug("Task {} ({}) remains QUEUED, no available node yet",
                        task.getId(), task.getTaskNo());
            }
            return false;
        }

        // 2. CAS 更新 Task 状态: PENDING/QUEUED → RUNNING
        try {
            task.setStatus(EvaluationTask.TaskStatus.RUNNING);
            task.setAssignedNodeId(node.getId());
            task.setStartedAt(Instant.now());
            task.setLastHeartbeatAt(Instant.now());
            task.setTimeoutSeconds(900); // 默认 15 分钟超时
            taskRepository.save(task); // @Version 乐观锁保护
        } catch (ObjectOptimisticLockingFailureException e) {
            log.warn("Task {} was already claimed by another dispatcher (optimistic lock)", task.getId());
            return false;
        }

        // 3. HTTP POST 调用 Agent /execute 接口
        try {
            String agentUrl = buildAgentUrl(node);
            Map<String, Object> payload = buildExecutePayload(task);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Agent-Token", agentToken); // Agent 认证

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);

            log.info("Dispatching task {} to node {} ({})", task.getTaskNo(), node.getName(), agentUrl);
            ResponseEntity<String> response = restTemplate.exchange(
                    agentUrl + "/execute", HttpMethod.POST, request, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                // 标记节点为 BUSY
                node.setStatus(ComputeNode.Status.BUSY);
                nodeRepository.save(node);
                log.info("Task {} dispatched successfully to node {}", task.getTaskNo(), node.getName());
                return true;
            } else {
                log.error("Agent returned non-2xx for task {}: {} {}",
                        task.getId(), response.getStatusCode(), response.getBody());
                rollbackTask(task);
                return false;
            }
        } catch (Exception e) {
            log.error("HTTP call to agent failed for task {}: {}", task.getId(), e.getMessage());
            rollbackTask(task);
            return false;
        }
    }

    /**
     * #349: 校验节点 IP 是否有效（非 null、非空、非 loopback）
     */
    private boolean isValidNodeIp(String ip) {
        return ip != null && !ip.isBlank()
                && !"127.0.0.1".equals(ip)
                && !"localhost".equals(ip);
    }

    /**
     * 找到一个可用节点
     * #346: 优先从任务关联的资源池中查找 ONLINE 节点，再 fallback 到全局
     * #349: 过滤掉 IP 无效的节点
     * #350: Plan 指定 nodeId 时优先分发到该节点
     */
    private ComputeNode findAvailableNode(EvaluationTask task) {
        // #350: 如果任务关联 Plan 且 Plan 指定了 nodeId，优先使用
        if (task.getPlanId() != null) {
            Optional<EvaluationPlan> planOpt = planRepository.findById(task.getPlanId());
            if (planOpt.isPresent() && planOpt.get().getNodeId() != null) {
                Long preferredNodeId = planOpt.get().getNodeId();
                Optional<ComputeNode> preferredNode = nodeRepository.findById(preferredNodeId);
                if (preferredNode.isPresent()) {
                    ComputeNode pn = preferredNode.get();
                    if (pn.getStatus() == ComputeNode.Status.ONLINE && isValidNodeIp(pn.getIpAddress())) {
                        log.info("Task {} using Plan-preferred node {} (id={})",
                                task.getTaskNo(), pn.getName(), pn.getId());
                        return pn;
                    } else {
                        log.warn("Plan-preferred node {} (id={}) is not available (status={}, ip={}), falling back",
                                pn.getName(), pn.getId(), pn.getStatus(), pn.getIpAddress());
                    }
                } else {
                    log.warn("Plan-preferred nodeId {} not found, falling back", preferredNodeId);
                }
            }
        }

        // 如果任务指定了资源池，优先从资源池内找
        if (task.getResourcePoolId() != null) {
            List<ComputeNode> poolNodes = nodeRepository.findByResourcePoolId(task.getResourcePoolId());
            List<ComputeNode> onlinePoolNodes = poolNodes.stream()
                    .filter(n -> n.getStatus() == ComputeNode.Status.ONLINE)
                    .filter(n -> isValidNodeIp(n.getIpAddress()))  // #349
                    .toList();
            if (!onlinePoolNodes.isEmpty()) {
                return onlinePoolNodes.get(0);
            }
            // 资源池内无可用节点，不 fallback 到全局（资源隔离原则）
            log.debug("No available ONLINE node with valid IP in resource pool {} for task {}",
                    task.getResourcePoolId(), task.getId());
            return null;
        }

        // 未指定资源池，从全局 ONLINE 节点中查找（#349: 过滤无效 IP）
        List<ComputeNode> onlineNodes = nodeRepository.findByStatus(ComputeNode.Status.ONLINE);
        List<ComputeNode> validNodes = onlineNodes.stream()
                .filter(n -> isValidNodeIp(n.getIpAddress()))
                .toList();
        if (!validNodes.isEmpty()) {
            return validNodes.get(0);
        }
        if (!onlineNodes.isEmpty()) {
            log.warn("Found {} ONLINE nodes but all have invalid IPs, cannot dispatch", onlineNodes.size());
        }
        return null;
    }

    /**
     * 构建 Agent URL: http://{ipAddress}:{agentPort}
     */
    private String buildAgentUrl(ComputeNode node) {
        String ip = node.getIpAddress();
        int port = node.getAgentPort() != null ? node.getAgentPort() : 8090;
        return "http://" + ip + ":" + port;
    }

    /**
     * 构建 /execute 请求体
     */
    private Map<String, Object> buildExecutePayload(EvaluationTask task) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", task.getId());
        payload.put("evalType", task.getEvalType().name());

        Map<String, Object> params = new HashMap<>();
        if (task.getEvalConfig() != null && !task.getEvalConfig().isBlank()) {
            try {
                params = objectMapper.readValue(task.getEvalConfig(), Map.class);
            } catch (Exception e) {
                log.warn("Failed to parse evalConfig for task {}: {}", task.getId(), e.getMessage());
            }
        }
        payload.put("params", params);
        payload.put("config", params);

        // #240: Include chip peak_gflops for compute utilization calculation
        if (task.getChipId() != null) {
            try {
                chipRepository.findById(task.getChipId()).ifPresent(chip -> {
                    Map<String, Object> chipInfo = new LinkedHashMap<>();
                    chipInfo.put("chipId", chip.getId());
                    chipInfo.put("chipName", chip.getName());
                    if (chip.getPeakGflopsFp32() != null) chipInfo.put("peak_gflops_fp32", chip.getPeakGflopsFp32());
                    if (chip.getPeakGflopsFp16() != null) chipInfo.put("peak_gflops_fp16", chip.getPeakGflopsFp16());
                    if (chip.getPeakBandwidthGbps() != null) chipInfo.put("peak_bandwidth_gbps", chip.getPeakBandwidthGbps());
                    payload.put("chip", chipInfo);
                });
            } catch (Exception e) {
                log.warn("Failed to load chip info for task {}: {}", task.getId(), e.getMessage());
            }
        }

        return payload;
    }

    /**
     * 分发失败时回滚 Task 状态
     */
    private void rollbackTask(EvaluationTask task) {
        try {
            task.setStatus(EvaluationTask.TaskStatus.PENDING);
            task.setAssignedNodeId(null);
            task.setStartedAt(null);
            task.setLastHeartbeatAt(null);
            taskRepository.save(task);
            log.info("Task {} rolled back to PENDING", task.getId());
        } catch (Exception e) {
            log.error("Failed to rollback task {}: {}", task.getId(), e.getMessage());
        }
    }
}
