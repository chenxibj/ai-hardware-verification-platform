package com.lab.node;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.*;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.task.TaskDispatcher;
import com.lab.gpu.GpuSlotService;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/nodes")
public class ComputeNodeController {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ComputeNodeController.class);

    private final ComputeNodeService service;
    private final ComputeNodeRepository repo;
    private final ObjectMapper objectMapper;

    private final EvaluationTaskRepository taskRepository;
    private final TaskDispatcher taskDispatcher;
    private final GpuSlotService gpuSlotService;

    public ComputeNodeController(ComputeNodeService service, ComputeNodeRepository repo, 
                                  ObjectMapper objectMapper, EvaluationTaskRepository taskRepository,
                                  TaskDispatcher taskDispatcher, GpuSlotService gpuSlotService) {
        this.service = service;
        this.repo = repo;
        this.objectMapper = objectMapper;
        this.taskRepository = taskRepository;
        this.taskDispatcher = taskDispatcher;
        this.gpuSlotService = gpuSlotService;
    }

    @GetMapping
    public ApiResponse<List<ComputeNode>> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) Long clusterId) {
        ComputeNode.Status statusEnum = null;
        if (status != null && !status.isBlank()) {
            try {
                statusEnum = ComputeNode.Status.valueOf(status.toUpperCase());
            } catch (IllegalArgumentException ignored) {}
        }
        return ApiResponse.ok(service.list(statusEnum, type, source, clusterId));
    }

    /**
     * GET /nodes/stats — 资源监控统计概览
     * NOTE: This must be declared BEFORE /{id} to avoid path collision
     */
    @GetMapping("/stats")
    public ApiResponse<Map<String, Object>> stats() {
        List<ComputeNode> allNodes = repo.findAll();
        int totalNodes = allNodes.size();
        int onlineNodes = 0;
        int offlineNodes = 0;
        int busyNodes = 0;
        int maintenanceNodes = 0;
        int errorNodes = 0;
        int totalCpu = 0;
        double totalMemory = 0;
        int totalGpu = 0;

        for (ComputeNode node : allNodes) {
            switch (node.getStatus()) {
                case ONLINE -> onlineNodes++;
                case OFFLINE -> offlineNodes++;
                case BUSY -> busyNodes++;
                case MAINTENANCE -> maintenanceNodes++;
                case ERROR -> errorNodes++;
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

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalNodes", totalNodes);
        stats.put("onlineNodes", onlineNodes);
        stats.put("offlineNodes", offlineNodes);
        stats.put("busyNodes", busyNodes);
        stats.put("maintenanceNodes", maintenanceNodes);
        stats.put("errorNodes", errorNodes);
        stats.put("totalCpu", totalCpu);
        stats.put("totalMemoryGb", Math.round(totalMemory * 10.0) / 10.0);
        stats.put("totalGpu", totalGpu);
        return ApiResponse.ok(stats);
    }

    /**
     * #384: GET /nodes/{id}/health — Node health check
     */
    @GetMapping("/{id}/health")
    public ApiResponse<Map<String, Object>> getNodeHealth(@PathVariable Long id) {
        ComputeNode node = service.getById(id);
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("nodeId", node.getId());
        health.put("nodeName", node.getName());
        health.put("status", node.getStatus().name());
        health.put("ipAddress", node.getIpAddress());
        health.put("agentPort", node.getAgentPort());
        health.put("lastHeartbeat", node.getLastHeartbeat() != null ? node.getLastHeartbeat().toString() : null);

        // Calculate minutes since last heartbeat
        if (node.getLastHeartbeat() != null) {
            long minutes = Duration.between(node.getLastHeartbeat(), Instant.now()).toMinutes();
            health.put("minutesSinceHeartbeat", minutes);
            health.put("heartbeatHealthy", minutes < 5);
        } else {
            health.put("minutesSinceHeartbeat", -1);
            health.put("heartbeatHealthy", false);
        }

        // Try to ping agent
        boolean agentReachable = false;
        if (node.getIpAddress() != null && node.getAgentPort() != null) {
            String url = "http://" + node.getIpAddress() + ":" + node.getAgentPort() + "/status";
            try {
                org.springframework.http.client.SimpleClientHttpRequestFactory factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
                factory.setConnectTimeout(3000);
                factory.setReadTimeout(3000);
                org.springframework.web.client.RestTemplate rt = new org.springframework.web.client.RestTemplate(factory);
                org.springframework.http.ResponseEntity<String> resp = rt.getForEntity(url, String.class);
                agentReachable = resp.getStatusCode().is2xxSuccessful();
            } catch (Exception e) {
                agentReachable = false;
            }
        }
        health.put("agentReachable", agentReachable);

        // Overall health
        boolean healthy = node.getStatus() == ComputeNode.Status.ONLINE
                && (node.getLastHeartbeat() == null || Duration.between(node.getLastHeartbeat(), Instant.now()).toMinutes() < 5);
        health.put("healthy", healthy);

        return ApiResponse.ok(health);
    }

    @GetMapping("/{id}")
    public ApiResponse<ComputeNode> getById(@PathVariable Long id) {
        return ApiResponse.ok(service.getById(id));
    }

    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ApiResponse<ComputeNode> register(@RequestBody ComputeNode node) {
        return ApiResponse.ok(service.register(node));
    }

    /**
     * POST /nodes/register — Agent 注册端点（permitAll in SecurityConfig）
     * 支持 cluster_name / cluster_id 关联 K8s 集群
     */
    @PostMapping("/register")
    public ApiResponse<ComputeNode> agentRegister(@RequestBody Map<String, Object> body) {
        ComputeNode node = new ComputeNode();
        if (body.containsKey("name")) node.setName(String.valueOf(body.get("name")));
        if (body.containsKey("ipAddress")) node.setIpAddress(String.valueOf(body.get("ipAddress")));
        if (body.containsKey("ip_address")) node.setIpAddress(String.valueOf(body.get("ip_address")));
        if (body.containsKey("agentPort")) node.setAgentPort(((Number) body.get("agentPort")).intValue());
        if (body.containsKey("agent_port")) node.setAgentPort(((Number) body.get("agent_port")).intValue());
        if (body.containsKey("description")) node.setDescription(String.valueOf(body.get("description")));
        if (body.containsKey("tags")) node.setTags(String.valueOf(body.get("tags")));
        if (body.containsKey("hardwareInfo")) node.setHardwareInfo(String.valueOf(body.get("hardwareInfo")));
        if (body.containsKey("hardware_info")) node.setHardwareInfo(String.valueOf(body.get("hardware_info")));
        // chipModel field
        if (body.containsKey("chipModel")) node.setChipModel(String.valueOf(body.get("chipModel")));
        if (body.containsKey("chip_model")) node.setChipModel(String.valueOf(body.get("chip_model")));

        // K8s cluster association
        Long clusterId = null;
        String clusterName = null;
        if (body.containsKey("clusterId")) clusterId = ((Number) body.get("clusterId")).longValue();
        if (body.containsKey("cluster_id")) clusterId = ((Number) body.get("cluster_id")).longValue();
        if (body.containsKey("clusterName")) clusterName = String.valueOf(body.get("clusterName"));
        if (body.containsKey("cluster_name")) clusterName = String.valueOf(body.get("cluster_name"));

        if (clusterId != null || clusterName != null) {
            node.setSource("k8s-daemonset");
            node.setClusterId(clusterId);
        }

        // If clusterName provided but no clusterId, try to resolve
        if (clusterId == null && clusterName != null) {
            node.setDescription("K8s cluster: " + clusterName);
        }

        // #478: GPU info
        Integer gpuCount = null;
        List<Map<String, Object>> gpuDetails = null;
        if (body.containsKey("gpuCount")) {
            gpuCount = ((Number) body.get("gpuCount")).intValue();
            node.setGpuCount(gpuCount);
        }
        if (body.containsKey("gpu_count")) {
            gpuCount = ((Number) body.get("gpu_count")).intValue();
            node.setGpuCount(gpuCount);
        }
        if (body.containsKey("gpuDetails")) {
            Object details = body.get("gpuDetails");
            if (details instanceof List) {
                gpuDetails = (List<Map<String, Object>>) details;
            }
        }
        if (body.containsKey("gpu_details")) {
            Object details = body.get("gpu_details");
            if (details instanceof List) {
                gpuDetails = (List<Map<String, Object>>) details;
            }
        }

        ComputeNode saved = service.registerWithCluster(node, clusterId, clusterName);

        // #478: Sync GPU slots after registration
        service.syncGpuSlotsFromRegistration(saved, gpuCount, gpuDetails);

        return ApiResponse.ok(saved);
    }

    @PutMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<ComputeNode> update(@PathVariable Long id, @RequestBody ComputeNode node) {
        return ApiResponse.ok(service.update(id, node));
    }

    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok();
    }

    @PostMapping("/{id}/heartbeat")
    public ApiResponse<Map<String, Object>> heartbeat(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        String hardwareInfo = null;
        Long clusterId = null;
        String clusterName = null;

        String chipModel = null;
        if (body != null) {
            if (body.containsKey("hardwareInfo")) {
                Object hw = body.get("hardwareInfo");
                hardwareInfo = hw != null ? hw.toString() : null;
            }
            // chipModel support
            if (body.containsKey("chipModel")) chipModel = String.valueOf(body.get("chipModel"));
            if (body.containsKey("chip_model")) chipModel = String.valueOf(body.get("chip_model"));
            // Support cluster association in heartbeat
            if (body.containsKey("clusterId")) clusterId = ((Number) body.get("clusterId")).longValue();
            if (body.containsKey("cluster_id")) clusterId = ((Number) body.get("cluster_id")).longValue();
            if (body.containsKey("clusterName")) clusterName = String.valueOf(body.get("clusterName"));
            if (body.containsKey("cluster_name")) clusterName = String.valueOf(body.get("cluster_name"));
        }

        ComputeNode node = service.heartbeatWithCluster(id, hardwareInfo, clusterId, clusterName);
        // Update chipModel if provided
        if (chipModel != null && !chipModel.isBlank()) {
            node.setChipModel(chipModel);
        }
        // #478: Process GPU metrics from heartbeat
        if (body != null) {
            service.updateGpuFromHeartbeat(node, body);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", node.getId());
        result.put("status", node.getStatus().name());
        result.put("lastHeartbeat", node.getLastHeartbeat().toString());
        return ApiResponse.ok(result);
    }

    /**
     * POST /api/nodes/{id}/diagnose — 节点诊断
     */
    @PostMapping("/{id}/diagnose")
    public ApiResponse<Map<String, Object>> diagnose(@PathVariable Long id) {
        ComputeNode node = service.getById(id);
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> issues = new ArrayList<>();
        List<String> suggestions = new ArrayList<>();

        result.put("nodeId", node.getId());
        result.put("nodeName", node.getName());
        result.put("currentStatus", node.getStatus().name());

        // 1. Check connectivity (ping)
        boolean pingOk = false;
        if (node.getIpAddress() != null && !node.getIpAddress().isBlank()) {
            try {
                ProcessBuilder pb = new ProcessBuilder("ping", "-c", "2", "-W", "3", node.getIpAddress());
                pb.redirectErrorStream(true);
                Process process = pb.start();
                int exitCode = process.waitFor();
                pingOk = (exitCode == 0);
            } catch (Exception e) {
                pingOk = false;
            }
            result.put("pingReachable", pingOk);
            if (!pingOk) {
                issues.add("节点 IP " + node.getIpAddress() + " ping 不通");
                suggestions.add("检查节点网络连接、防火墙规则、安全组设置");
            }
        } else {
            result.put("pingReachable", "N/A - 未配置IP");
            issues.add("节点未配置 IP 地址");
            suggestions.add("请在节点管理中配置正确的 IP 地址");
        }

        // 2. Check SSH connectivity
        boolean sshOk = false;
        if (pingOk && node.getIpAddress() != null) {
            String sshUser = node.getSshUser() != null ? node.getSshUser() : "root";
            int sshPort = node.getSshPort() != null ? node.getSshPort() : 22;
            try {
                ProcessBuilder pb = new ProcessBuilder(
                    "ssh", "-o", "StrictHostKeyChecking=no",
                    "-o", "ConnectTimeout=5",
                    "-o", "BatchMode=yes",
                    "-p", String.valueOf(sshPort),
                    sshUser + "@" + node.getIpAddress(),
                    "echo ok"
                );
                pb.redirectErrorStream(true);
                Process process = pb.start();
                BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                String line = reader.readLine();
                int exitCode = process.waitFor();
                sshOk = (exitCode == 0 && "ok".equals(line));
            } catch (Exception e) {
                sshOk = false;
            }
            result.put("sshConnectable", sshOk);
            if (!sshOk) {
                issues.add("SSH 连接失败 (" + sshUser + "@" + node.getIpAddress() + ":" + sshPort + ")");
                suggestions.add("检查 SSH 服务是否运行、密钥配置、端口是否开放");
            }
        } else {
            result.put("sshConnectable", "N/A");
        }

        // 3. Check agent process
        boolean agentRunning = false;
        if (sshOk && node.getIpAddress() != null) {
            String sshUser = node.getSshUser() != null ? node.getSshUser() : "root";
            int sshPort = node.getSshPort() != null ? node.getSshPort() : 22;
            try {
                ProcessBuilder pb = new ProcessBuilder(
                    "ssh", "-o", "StrictHostKeyChecking=no",
                    "-o", "ConnectTimeout=5",
                    "-p", String.valueOf(sshPort),
                    sshUser + "@" + node.getIpAddress(),
                    "pgrep -f 'python.*main.py' || pgrep -f 'ahvp-agent' || echo AGENT_NOT_FOUND"
                );
                pb.redirectErrorStream(true);
                Process process = pb.start();
                BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                String line = reader.readLine();
                int exitCode = process.waitFor();
                agentRunning = (exitCode == 0 && !"AGENT_NOT_FOUND".equals(line));
            } catch (Exception e) {
                agentRunning = false;
            }
            result.put("agentRunning", agentRunning);
            if (!agentRunning) {
                issues.add("Agent 进程未运行");
                suggestions.add("使用修复接口 POST /api/nodes/" + id + "/repair 尝试重启 agent，或手动 SSH 到节点启动");
            }
        } else {
            result.put("agentRunning", "N/A - SSH不可用");
        }

        // 4. Check heartbeat
        if (node.getLastHeartbeat() != null) {
            Duration sinceLast = Duration.between(node.getLastHeartbeat(), Instant.now());
            long minutes = sinceLast.toMinutes();
            result.put("lastHeartbeat", node.getLastHeartbeat().toString());
            result.put("minutesSinceHeartbeat", minutes);
            if (minutes > 5) {
                issues.add("最后心跳在 " + minutes + " 分钟前（超过5分钟阈值）");
                if (minutes > 60) {
                    suggestions.add("节点已长时间无心跳（" + minutes + "分钟），建议检查节点是否宕机或 agent 是否异常退出");
                } else {
                    suggestions.add("心跳中断，可能是 agent 进程崩溃或网络抖动，建议尝试重启 agent");
                }
            }
        } else {
            result.put("lastHeartbeat", "从未收到心跳");
            result.put("minutesSinceHeartbeat", -1);
            issues.add("从未收到该节点心跳");
            suggestions.add("请确认 agent 已正确部署并配置了正确的 platform URL 和 node ID");
        }

        // 5. Overall health
        String health;
        if (issues.isEmpty()) {
            health = "HEALTHY";
        } else if (issues.size() <= 2 && pingOk) {
            health = "DEGRADED";
        } else {
            health = "UNHEALTHY";
        }
        result.put("health", health);
        result.put("issues", issues);
        result.put("suggestions", suggestions);

        return ApiResponse.ok(result);
    }

    /**
     * POST /api/nodes/{id}/repair — 节点修复
     */
    @PostMapping("/{id}/repair")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Map<String, Object>> repair(@PathVariable Long id) {
        ComputeNode node = service.getById(id);
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> actions = new ArrayList<>();
        boolean success = false;

        result.put("nodeId", node.getId());
        result.put("nodeName", node.getName());

        if (node.getIpAddress() == null || node.getIpAddress().isBlank()) {
            result.put("success", false);
            result.put("error", "节点未配置 IP 地址，无法远程修复");
            return ApiResponse.ok(result);
        }

        String sshUser = node.getSshUser() != null ? node.getSshUser() : "root";
        int sshPort = node.getSshPort() != null ? node.getSshPort() : 22;

        try {
            ProcessBuilder pb = new ProcessBuilder(
                "ssh", "-o", "StrictHostKeyChecking=no",
                "-o", "ConnectTimeout=10",
                "-p", String.valueOf(sshPort),
                sshUser + "@" + node.getIpAddress(),
                "pkill -f 'python.*main.py' 2>/dev/null; sleep 1; echo KILLED"
            );
            pb.redirectErrorStream(true);
            Process process = pb.start();
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            reader.readLine();
            process.waitFor();
            actions.add("停止旧 agent 进程");
        } catch (Exception e) {
            actions.add("停止旧进程失败: " + e.getMessage());
        }

        try {
            ProcessBuilder pb = new ProcessBuilder(
                "ssh", "-o", "StrictHostKeyChecking=no",
                "-o", "ConnectTimeout=10",
                "-p", String.valueOf(sshPort),
                sshUser + "@" + node.getIpAddress(),
                "cd /root/ai-hardware-verification-platform/agent && nohup python3 main.py > agent.log 2>&1 & sleep 2 && pgrep -f 'python.*main.py' && echo STARTED || echo FAILED"
            );
            pb.redirectErrorStream(true);
            Process process = pb.start();
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            StringBuilder output = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
            process.waitFor();
            String outputStr = output.toString().trim();
            if (outputStr.contains("STARTED")) {
                actions.add("Agent 进程已重启");
                success = true;
            } else {
                actions.add("Agent 重启失败: " + outputStr);
            }
        } catch (Exception e) {
            actions.add("重启 agent 失败: " + e.getMessage());
        }

        if (success) {
            node.setStatus(ComputeNode.Status.ONLINE);
            node.setErrorMessage(null);
            repo.save(node);
            actions.add("节点状态更新为 ONLINE");
        } else {
            node.setStatus(ComputeNode.Status.ERROR);
            node.setErrorMessage("自动修复失败，请手动检查");
            repo.save(node);
            actions.add("节点状态更新为 ERROR");
        }

        result.put("success", success);
        result.put("actions", actions);
        return ApiResponse.ok(result);
    }


    /**
     * POST /api/nodes/{id}/poll-tasks — Agent 拉取待执行任务（Pull-based dispatch）
     * Agent 在心跳时调用此接口，获取分配给自己的 DISPATCHED 状态任务
     * 返回任务列表后，任务状态从 DISPATCHED -> RUNNING
     * 
     * #401: Also returns cancel instructions for tasks that have been CANCELLED
     * 
     * Request body (optional): {"maxTasks": 1}
     * Response: {"code": 0, "data": [{"taskId": ..., "evalType": ..., "params": ..., "config": ...}]}
     */
    @PostMapping("/{id}/poll-tasks")
    public ApiResponse<Map<String, Object>> pollTasks(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        
        int maxTasks = 1;
        if (body != null && body.containsKey("maxTasks")) {
            maxTasks = Math.min(((Number) body.get("maxTasks")).intValue(), 8);
        }
        
        // 查找分配给此节点的 DISPATCHED 任务
        List<EvaluationTask> allDispatched = taskRepository.findByStatusAndAssignedNodeId(
                EvaluationTask.TaskStatus.DISPATCHED, id);
        List<EvaluationTask> dispatched = allDispatched.stream()
                .limit(maxTasks)
                .collect(Collectors.toList());
        
        List<Map<String, Object>> newTasks = new java.util.ArrayList<>();
        for (EvaluationTask task : dispatched) {
            // 更新状态为 RUNNING
            task.setStatus(EvaluationTask.TaskStatus.RUNNING);
            task.setStartedAt(java.time.Instant.now());
            task.setLastHeartbeatAt(java.time.Instant.now());
            taskRepository.save(task);
            
            // 构建任务执行载荷（复用 TaskDispatcher 的构建逻辑）
            Map<String, Object> payload = taskDispatcher.buildExecutePayload(task);
            newTasks.add(payload);
            
            log.info("Agent {} polled task {} ({}), status -> RUNNING", id, task.getTaskNo(), task.getId());
        }

        // #401: Check for tasks that should be cancelled (CANCELLED status but assigned to this node)
        List<EvaluationTask> cancelledTasks = taskRepository.findByAssignedNodeIdAndStatus(id,
                EvaluationTask.TaskStatus.CANCELLED).stream()
                .filter(t -> t.getCompletedAt() != null &&
                        java.time.Duration.between(t.getCompletedAt(), java.time.Instant.now()).toMinutes() < 30)
                .collect(Collectors.toList());
        
        List<Map<String, Object>> cancelInstructions = new java.util.ArrayList<>();
        for (EvaluationTask task : cancelledTasks) {
            Map<String, Object> cancelCmd = new java.util.LinkedHashMap<>();
            cancelCmd.put("taskId", task.getId());
            cancelCmd.put("taskNo", task.getTaskNo());
            cancelCmd.put("action", "cancel");
            cancelCmd.put("reason", "Task cancelled by user");
            cancelInstructions.add(cancelCmd);
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("tasks", newTasks);
        result.put("cancelTasks", cancelInstructions);
        
        return ApiResponse.ok(result);
    }


    /**
     * POST /api/nodes/{nodeId}/reject-task/{taskId} — Agent 退回无法执行的任务
     * #443: 当 Agent worker 已满，poll 到的任务无法执行时，退回为 QUEUED 状态
     */
    @PostMapping("/{nodeId}/reject-task/{taskId}")
    public ApiResponse<String> rejectTask(
            @PathVariable Long nodeId,
            @PathVariable Long taskId,
            @RequestBody(required = false) Map<String, Object> body) {
        
        EvaluationTask task = taskRepository.findById(taskId).orElse(null);
        if (task == null) {
            return ApiResponse.error(404, "Task not found: " + taskId);
        }
        
        // 只有 RUNNING 或 DISPATCHED 状态的任务才能退回
        if (task.getStatus() != EvaluationTask.TaskStatus.RUNNING &&
            task.getStatus() != EvaluationTask.TaskStatus.DISPATCHED) {
            return ApiResponse.error(400, "Task " + taskId + " is " + task.getStatus() + ", cannot reject");
        }
        
        // 退回为 QUEUED，清除分配信息
        String reason = body != null ? (String) body.getOrDefault("reason", "worker full") : "worker full";
        log.info("Agent {} rejecting task {} ({}): {}", nodeId, task.getTaskNo(), taskId, reason);
        
        task.setStatus(EvaluationTask.TaskStatus.QUEUED);
        task.setAssignedNodeId(null);
        task.setStartedAt(null);
        task.setLastHeartbeatAt(null);
        task.setQueueReason("Agent 退回: " + reason);
        taskRepository.save(task);

        // #488 P1-13: Release GPU slots on reject
        try { gpuSlotService.releaseGpuSlots(task.getId()); } catch (Exception e) {
            log.warn("GPU slot release failed on reject for task {}: {}", taskId, e.getMessage());
        }

        // #488: Trigger dispatch for queued tasks
        try { taskDispatcher.tryDispatchNext(); } catch (Exception e) {
            log.debug("Post-reject dispatch attempt: {}", e.getMessage());
        }

        return ApiResponse.ok("Task " + taskId + " rejected back to QUEUED");
    }

}
