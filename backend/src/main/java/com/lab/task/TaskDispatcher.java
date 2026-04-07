package com.lab.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
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
 * #222
 */
@Slf4j
@Service
public class TaskDispatcher {

    private final EvaluationTaskRepository taskRepository;
    private final ComputeNodeRepository nodeRepository;
    private final ObjectMapper objectMapper;

    @Value("${agent.token:ahvp-agent-secret-2026}")
    private String agentToken;

    private final RestTemplate restTemplate = new RestTemplate();

    public TaskDispatcher(EvaluationTaskRepository taskRepository,
                          ComputeNodeRepository nodeRepository,
                          ObjectMapper objectMapper) {
        this.taskRepository = taskRepository;
        this.nodeRepository = nodeRepository;
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
     */
    public boolean dispatchSingleTask(EvaluationTask task) {
        // 1. 找到一个可用节点 (ONLINE 且非 BUSY)
        ComputeNode node = findAvailableNode(task);
        if (node == null) {
            log.warn("No available node for task {} ({}), will be picked up by recovery scheduler",
                    task.getId(), task.getTaskNo());
            return false;
        }

        // 2. CAS 更新 Task 状态: PENDING → RUNNING
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
     * 找到一个可用节点
     */
    private ComputeNode findAvailableNode(EvaluationTask task) {
        List<ComputeNode> onlineNodes = nodeRepository.findByStatus(ComputeNode.Status.ONLINE);
        if (!onlineNodes.isEmpty()) {
            return onlineNodes.get(0);
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
