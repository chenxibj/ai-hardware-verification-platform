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

@RestController
@RequestMapping("/nodes")
public class ComputeNodeController {

    private final ComputeNodeService service;
    private final ComputeNodeRepository repo;
    private final ObjectMapper objectMapper;

    public ComputeNodeController(ComputeNodeService service, ComputeNodeRepository repo, ObjectMapper objectMapper) {
        this.service = service;
        this.repo = repo;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ApiResponse<List<ComputeNode>> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type) {
        ComputeNode.Status statusEnum = null;
        if (status != null && !status.isBlank()) {
            try {
                statusEnum = ComputeNode.Status.valueOf(status.toUpperCase());
            } catch (IllegalArgumentException ignored) {}
        }
        return ApiResponse.ok(service.list(statusEnum, type));
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
     */
    @PostMapping("/register")
    public ApiResponse<ComputeNode> agentRegister(@RequestBody ComputeNode node) {
        return ApiResponse.ok(service.register(node));
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
        if (body != null && body.containsKey("hardwareInfo")) {
            Object hw = body.get("hardwareInfo");
            hardwareInfo = hw != null ? hw.toString() : null;
        }
        ComputeNode node = service.heartbeat(id, hardwareInfo);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", node.getId());
        result.put("status", node.getStatus().name());
        result.put("lastHeartbeat", node.getLastHeartbeat().toString());
        return ApiResponse.ok(result);
    }

    /**
     * POST /api/nodes/{id}/diagnose — 节点诊断
     * 检查节点连通性、agent进程、心跳状态
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

        // 2. Check SSH connectivity (if IP and SSH config available)
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

        // 3. Check agent process (via SSH if available)
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
     * 尝试重启 agent 进程，更新节点状态
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

        // Step 1: Try to kill existing agent process
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
            String line = reader.readLine();
            process.waitFor();
            actions.add("停止旧 agent 进程");
        } catch (Exception e) {
            actions.add("停止旧进程失败: " + e.getMessage());
        }

        // Step 2: Try to restart agent
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
            int exitCode = process.waitFor();
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

        // Step 3: Update node status
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
}
