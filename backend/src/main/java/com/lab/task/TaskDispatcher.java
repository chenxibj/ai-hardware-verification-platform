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
import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;
import com.lab.gpu.GpuSlot;
import com.lab.gpu.GpuSlotService;
import java.util.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.http.client.SimpleClientHttpRequestFactory;

/**
 * 评测任务分发引擎
 * 负责将 PENDING 状态的 Task 分发到 ONLINE 的 Agent 节点执行
 * #222, #346: 增加资源池感知 + QUEUED 排队机制
 * #349: 校验节点 IP 有效性
 * #350: Plan 指定 nodeId 时优先分发到该节点
 * #357: 移除过度 IP 段过滤，改为 agent 可达性检测
 */
@Slf4j
@Service
public class TaskDispatcher {

    private final EvaluationTaskRepository taskRepository;
    private final ComputeNodeRepository nodeRepository;
    private final EvaluationPlanRepository planRepository;
    private final ChipRepository chipRepository;
    private final ObjectMapper objectMapper;
    private final RunSpecRepository runSpecRepository;
    private final GpuSlotService gpuSlotService;

    @Value("${agent.token:ahvp-agent-secret-2026}")
    private String agentToken;

    private final RestTemplate restTemplate;

    private static RestTemplate createTimeoutRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3_000);  // 3s connect timeout
        factory.setReadTimeout(10_000);    // 10s read timeout
        return new RestTemplate(factory);
    }

    public TaskDispatcher(EvaluationTaskRepository taskRepository,
                          ComputeNodeRepository nodeRepository,
                          EvaluationPlanRepository planRepository,
                          ChipRepository chipRepository,
                          ObjectMapper objectMapper,
                          RunSpecRepository runSpecRepository,
                          GpuSlotService gpuSlotService) {
        this.taskRepository = taskRepository;
        this.nodeRepository = nodeRepository;
        this.planRepository = planRepository;
        this.chipRepository = chipRepository;
        this.objectMapper = objectMapper;
        this.runSpecRepository = runSpecRepository;
        this.gpuSlotService = gpuSlotService;
        this.restTemplate = createTimeoutRestTemplate();
    }


    /**
     * 事件驱动分发：尝试分发所有可分发的 QUEUED 任务（受可用节点限制）
     * #359: 批量分发，不再只取第一个
     * #360: 自动取消已终态方案的残留任务
     */
    public void tryDispatchNext() {
        List<ComputeNode> availableNodes = nodeRepository.findByStatus(ComputeNode.Status.ONLINE);
        if (availableNodes.isEmpty()) return;

        List<EvaluationTask> queuedTasks = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();
        if (queuedTasks.isEmpty()) return;

        int dispatched = 0;
        for (EvaluationTask task : queuedTasks) {
            // #360: 跳过已取消/完成方案的任务（自动取消）
            if (task.getPlanId() != null) {
                var planOpt = planRepository.findById(task.getPlanId());
                if (planOpt.isPresent()) {
                    var plan = planOpt.get();
                    if (plan.getStatus() == EvaluationPlan.PlanStatus.CANCELLED ||
                        plan.getStatus() == EvaluationPlan.PlanStatus.COMPLETED) {
                        task.setStatus(EvaluationTask.TaskStatus.CANCELLED);
                        task.setCompletedAt(Instant.now());
                        taskRepository.save(task);
                        log.info("Auto-cancelled task {} (plan {} is {})",
                            task.getTaskNo(), plan.getPlanNo(), plan.getStatus());
                        continue;
                    }
                }
            }

            try {
                boolean success = dispatchSingleTask(task);
                if (success) dispatched++;
            } catch (Exception e) {
                log.debug("Dispatch failed for task {}: {}", task.getTaskNo(), e.getMessage());
            }
        }

        if (dispatched > 0) {
            log.info("Event-driven dispatch: {} tasks dispatched from queue", dispatched);
        }
    }

    /**
     * 分发指定 Plan 下所有 PENDING 的 Task
     * #354: 异步执行，不阻塞 API 请求
     */
    @Async
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
            // #346: 无可用节点 → 任务进入排队状态（含排队原因）
            if (task.getStatus() != EvaluationTask.TaskStatus.QUEUED) {
                task.setStatus(EvaluationTask.TaskStatus.QUEUED);
                taskRepository.save(task);
                log.info("No available node for task {} ({}), status set to QUEUED, reason: {}",
                        task.getId(), task.getTaskNo(), task.getQueueReason());
            } else {
                // Update queue reason even if already QUEUED
                taskRepository.save(task);
                log.debug("Task {} ({}) remains QUEUED, reason: {}",
                        task.getId(), task.getTaskNo(), task.getQueueReason());
            }
            return false;
        }

        // 1.5 GPU Slot 预检查：节点有足够空闲 GPU 才 dispatch
        RunSpec runSpec = resolveRunSpec(task);
        int gpuNeeded = (runSpec != null && runSpec.getGpuPerNode() != null && runSpec.getGpuPerNode() > 0)
                ? runSpec.getGpuPerNode() : 1;  // 默认需要 1 GPU
        long freeSlots = gpuSlotService.countFreeSlots(node.getId());
        long totalSlots = gpuSlotService.countTotalSlots(node.getId());
        if (totalSlots > 0 && freeSlots < gpuNeeded) {
            // 该节点有 GPU Slot 管理但空闲不足
            String reason = String.format("等待 GPU 资源释放（节点 %s: %d/%d 空闲，需要 %d）",
                    node.getName(), freeSlots, totalSlots, gpuNeeded);
            task.setQueueReason(reason);
            if (task.getStatus() != EvaluationTask.TaskStatus.QUEUED) {
                task.setStatus(EvaluationTask.TaskStatus.QUEUED);
            }
            taskRepository.save(task);
            log.info("GPU Slot insufficient for task {}: {}", task.getTaskNo(), reason);
            return false;
        }

        // 2. CAS 检查（乐观锁保护）— 实际状态更新在 step 3
        // 先检查任务是否已被其他调度器认领
        try {
            taskRepository.save(task); // @Version 乐观锁保护
        } catch (ObjectOptimisticLockingFailureException e) {
            log.warn("Task {} was already claimed by another dispatcher (optimistic lock)", task.getId());
            return false;
        }

        // 3. Pull-based dispatch: 标记任务为 DISPATCHED，等待 Agent 心跳时拉取
        //    不再 HTTP POST 推送到 Agent，而是 Agent 主动来拉
        try {
            task.setStatus(EvaluationTask.TaskStatus.DISPATCHED);
            task.setAssignedNodeId(node.getId());
            task.setStartedAt(Instant.now());
            task.setLastHeartbeatAt(Instant.now());
            task.setTimeoutSeconds(900);
            taskRepository.save(task);

            // #397: GPU Slot already checked in pre-check. Allocate now.
            try {
                if (totalSlots > 0) {
                    gpuSlotService.allocateGpuSlots(node.getId(), gpuNeeded, task.getId());
                    log.info("Allocated {} GPU slot(s) on {} for task {}", gpuNeeded, node.getName(), task.getTaskNo());
                }
            } catch (Exception e) {
                log.warn("GPU slot allocation failed for task {} (non-fatal): {}", task.getTaskNo(), e.getMessage());
            }

            log.info("Task {} dispatched (pull-mode) to node {} - waiting for agent to poll",
                    task.getTaskNo(), node.getName());
            return true;
        } catch (Exception e) {
            log.error("Failed to mark task {} as DISPATCHED: {}", task.getTaskNo(), e.getMessage());
            rollbackTask(task, "dispatch failed: " + e.getMessage());
            return false;
        }
    }

    /**
     * #349: 校验节点 IP 是否有效（非 null、非空、非 loopback）
     * #357: 不再按网段过滤，Docker bridge IP (172.17.0.1) 等内网地址应当可用
     */
    private boolean isValidNodeIp(String ip) {
        if (ip == null || ip.isBlank()) return false;
        if ("127.0.0.1".equals(ip) || "localhost".equals(ip) || "0.0.0.0".equals(ip)) return false;
        return true;
    }

    /**
     * #357: 快速检测 Agent 是否可达（2秒超时）
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
            log.debug("Agent {} not reachable at {}: {}", node.getName(), url, e.getMessage());
            return false;
        }
    }

    /**
     * 芯片型号匹配：大小写不敏感，包含匹配
     */
    private boolean chipModelMatches(ComputeNode node, String chipName) {
        if (node.getChipModel() == null || node.getChipModel().isBlank()) return false;
        if (chipName == null || chipName.isBlank()) return false;
        return node.getChipModel().toLowerCase().contains(chipName.toLowerCase())
                || chipName.toLowerCase().contains(node.getChipModel().toLowerCase());
    }

    /**
     * 找到一个可用节点 — 三级调度优先级（芯片亲和性）
     *
     * 1. Plan 指定了具体 nodeId → 只用该节点（硬约束，不 fallback）
     * 2. Plan 只指定了 chipId（未指定 nodeId）→ 在芯片匹配的节点中选最空闲的（硬约束）
     * 3. 都没指定 → 现有逻辑（任意可用节点）
     *
     * 芯片亲和性是硬约束，宁可排队也不跑错节点
     */
    private ComputeNode findAvailableNode(EvaluationTask task) {
        EvaluationPlan plan = null;
        if (task.getPlanId() != null) {
            Optional<EvaluationPlan> planOpt = planRepository.findById(task.getPlanId());
            if (planOpt.isPresent()) plan = planOpt.get();
        }

        // ============ 优先级 1: Plan 指定了具体 nodeId ============
        if (plan != null && plan.getNodeId() != null) {
            Long preferredNodeId = plan.getNodeId();
            Optional<ComputeNode> preferredNode = nodeRepository.findById(preferredNodeId);
            if (preferredNode.isEmpty()) {
                String reason = "指定节点 ID=" + preferredNodeId + " 不存在";
                task.setQueueReason(reason);
                log.warn("Task {} queue reason: {}", task.getTaskNo(), reason);
                return null;
            }
            ComputeNode pn = preferredNode.get();
            if ((pn.getStatus() == ComputeNode.Status.ONLINE || pn.getStatus() == ComputeNode.Status.BUSY) && isValidNodeIp(pn.getIpAddress()) ) {
                log.info("Task {} using Plan-specified node {} (id={})",
                        task.getTaskNo(), pn.getName(), pn.getId());
                task.setQueueReason(null); // clear any previous reason
                return pn;
            } else {
                // 硬约束：不 fallback，宁可排队
                String reason;
                if ((pn.getStatus() == ComputeNode.Status.ONLINE || pn.getStatus() == ComputeNode.Status.BUSY) && isValidNodeIp(pn.getIpAddress())) {
                    reason = String.format("等待节点 %s 可用", pn.getName());
                } else if (pn.getStatus() == ComputeNode.Status.ONLINE) {
                    reason = String.format("等待节点 %s 配置有效 IP（当前 IP 无效）", pn.getName());
                } else {
                    reason = String.format("等待节点 %s 上线（当前状态: %s）", pn.getName(), pn.getStatus());
                }
                task.setQueueReason(reason);
                log.info("Task {} queue reason: {}", task.getTaskNo(), reason);
                return null;
            }
        }

        // ============ 优先级 2: Plan 指定了 chipId（未指定 nodeId）============
        Long chipId = (plan != null) ? plan.getChipId() : task.getChipId();
        if (plan != null && plan.getNodeId() == null && chipId != null) {
            Optional<Chip> chipOpt = chipRepository.findById(chipId);
            if (chipOpt.isPresent()) {
                String chipName = chipOpt.get().getName();
                log.debug("Task {} looking for chip affinity: chipName={}", task.getTaskNo(), chipName);

                List<ComputeNode> allOnline = new java.util.ArrayList<>(nodeRepository.findByStatus(ComputeNode.Status.ONLINE));
                allOnline.addAll(nodeRepository.findByStatus(ComputeNode.Status.BUSY));
                // Filter by chip model match
                List<ComputeNode> chipMatchedNodes = allOnline.stream()
                        .filter(n -> isValidNodeIp(n.getIpAddress()))
                        .filter(n -> !"k8s-daemonset".equals(n.getSource()))
                        .filter(n -> chipModelMatches(n, chipName))
                        .toList();

                // Further filter by reachability
                List<ComputeNode> reachableNodes = chipMatchedNodes.stream()
                        
                        .toList();

                if (!reachableNodes.isEmpty()) {
                    // Pick the least busy (prefer ONLINE over BUSY)
                    ComputeNode best = reachableNodes.stream()
                            .sorted((a, b) -> {
                                // ONLINE nodes first, then BUSY
                                int statusOrder = Integer.compare(
                                        a.getStatus() == ComputeNode.Status.ONLINE ? 0 : 1,
                                        b.getStatus() == ComputeNode.Status.ONLINE ? 0 : 1);
                                return statusOrder;
                            })
                            .findFirst().orElse(reachableNodes.get(0));
                    log.info("Task {} chip affinity matched node {} (chipModel={}) for chip {}",
                            task.getTaskNo(), best.getName(), best.getChipModel(), chipName);
                    task.setQueueReason(null);
                    return best;
                } else {
                    // Count total chip-matching nodes (online + offline) for better message
                    List<ComputeNode> allNodes = nodeRepository.findAll();
                    long totalMatching = allNodes.stream()
                            .filter(n -> chipModelMatches(n, chipName))
                            .count();
                    long onlineMatching = chipMatchedNodes.size();
                    String reason;
                    if (onlineMatching > 0) {
                        reason = String.format("等待 %s 类型节点可用（%d 个节点注册）",
                                chipName, onlineMatching);
                    } else {
                        reason = String.format("等待 %s 类型节点上线（共 %d 个注册节点，0 个 ONLINE）",
                                chipName, totalMatching);
                    }
                    task.setQueueReason(reason);
                    log.info("Task {} queue reason: {}", task.getTaskNo(), reason);
                    return null;  // 硬约束：不 fallback
                }
            }
        }

        // ============ 优先级 3: 都没指定 → 任意可用节点 ============
        // 如果任务指定了资源池，优先从资源池内找
        if (task.getResourcePoolId() != null) {
            List<ComputeNode> poolNodes = nodeRepository.findByResourcePoolId(task.getResourcePoolId());
            List<ComputeNode> onlinePoolNodes = poolNodes.stream()
                    .filter(n -> n.getStatus() == ComputeNode.Status.ONLINE || n.getStatus() == ComputeNode.Status.BUSY)
                    .filter(n -> isValidNodeIp(n.getIpAddress()))
                    .filter(n -> !"k8s-daemonset".equals(n.getSource()))
                    
                    .toList();
            if (!onlinePoolNodes.isEmpty()) {
                task.setQueueReason(null);
                return onlinePoolNodes.get(0);
            }
            String reason = String.format("资源池内无可用节点（池 ID=%d）", task.getResourcePoolId());
            task.setQueueReason(reason);
            log.debug("Task {} queue reason: {}", task.getTaskNo(), reason);
            return null;
        }

        // 全局 ONLINE 节点
        List<ComputeNode> onlineNodes = new java.util.ArrayList<>(nodeRepository.findByStatus(ComputeNode.Status.ONLINE));
        onlineNodes.addAll(nodeRepository.findByStatus(ComputeNode.Status.BUSY));
        List<ComputeNode> validNodes = onlineNodes.stream()
                .filter(n -> isValidNodeIp(n.getIpAddress()))
                .filter(n -> !"k8s-daemonset".equals(n.getSource()))
                
                .toList();
        if (!validNodes.isEmpty()) {
            task.setQueueReason(null);
            return validNodes.get(0);
        }
        if (!onlineNodes.isEmpty()) {
            log.warn("Found {} ONLINE nodes but none reachable, cannot dispatch", onlineNodes.size());
        }
        String reason = String.format("无可用节点（全局 %d 个 ONLINE 节点，0 个可达）", onlineNodes.size());
        task.setQueueReason(reason);
        return null;
    }

    /**
     * #397: 解析任务的 RunSpec
     */
    private RunSpec resolveRunSpec(EvaluationTask task) {
        if (task.getRunSpecId() != null) {
            return runSpecRepository.findById(task.getRunSpecId()).orElse(null);
        }
        if (task.getRunSpecCode() != null && !task.getRunSpecCode().isBlank()) {
            return runSpecRepository.findByCode(task.getRunSpecCode()).orElse(null);
        }
        if (task.getPlanId() != null) {
            var plan = planRepository.findById(task.getPlanId()).orElse(null);
            if (plan != null && plan.getRunSpecId() != null) {
                return runSpecRepository.findById(plan.getRunSpecId()).orElse(null);
            }
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
    public Map<String, Object> buildExecutePayload(EvaluationTask task) {
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
                    chipInfo.put("chipType", chip.getChipType().name());
                    if (chip.getPeakGflopsFp32() != null) chipInfo.put("peak_gflops_fp32", chip.getPeakGflopsFp32());
                    if (chip.getPeakGflopsFp16() != null) chipInfo.put("peak_gflops_fp16", chip.getPeakGflopsFp16());
                    if (chip.getPeakBandwidthGbps() != null) chipInfo.put("peak_bandwidth_gbps", chip.getPeakBandwidthGbps());
                    payload.put("chip", chipInfo);
                });
            } catch (Exception e) {
                log.warn("Failed to load chip info for task {}: {}", task.getId(), e.getMessage());
            }
        }

        // #397: Include RunSpec in payload
        RunSpec runSpec = resolveRunSpec(task);
        if (runSpec != null) {
            Map<String, Object> runSpecMap = new LinkedHashMap<>();
            runSpecMap.put("code", runSpec.getCode());
            runSpecMap.put("gpuPerNode", runSpec.getGpuPerNode());
            runSpecMap.put("gpuExclusive", runSpec.getGpuExclusive());
            runSpecMap.put("parallelMode", runSpec.getParallelMode());
            runSpecMap.put("nodeCount", runSpec.getNodeCount());

            // Include allocated GPU indices
            if (task.getAssignedNodeId() != null) {
                List<GpuSlot> slots = gpuSlotService.getNodeGpuSlots(task.getAssignedNodeId()).stream()
                        .filter(s -> task.getId().equals(s.getAllocatedTaskId()))
                        .toList();
                if (!slots.isEmpty()) {
                    runSpecMap.put("gpuIndices", slots.stream().map(GpuSlot::getGpuIndex).toList());
                }
            }

            payload.put("runSpec", runSpecMap);

            // Multi-node distributed config
            if (runSpec.getNodeCount() != null && runSpec.getNodeCount() > 1) {
                Map<String, Object> distributed = new LinkedHashMap<>();
                distributed.put("worldSize", runSpec.getNodeCount() * runSpec.getGpuPerNode());
                distributed.put("nprocPerNode", runSpec.getGpuPerNode());
                distributed.put("parallelMode", runSpec.getParallelMode());
                distributed.put("backend", "nccl");
                payload.put("distributed", distributed);
            }
        }

        return payload;
    }

    /**
     * 分发失败时回滚 Task 状态
     */
    private void rollbackTask(EvaluationTask task, String reason) {
        task.setQueueReason(reason);
        rollbackTask(task);
    }

    private void rollbackTask(EvaluationTask task) {
        try {
            task.setStatus(EvaluationTask.TaskStatus.QUEUED);
            task.setAssignedNodeId(null);
            task.setStartedAt(null);
            task.setLastHeartbeatAt(null);
            task.setQueueReason("分发失败后回滚，等待重新调度");
            taskRepository.save(task);
            // #397: Release GPU slots on rollback
            try { gpuSlotService.releaseGpuSlots(task.getId()); } catch (Exception ignored) {}
            log.info("Task {} rolled back to QUEUED", task.getId());
        } catch (Exception e) {
            log.error("Failed to rollback task {}: {}", task.getId(), e.getMessage());
        }
    }
}
