package com.lab.node;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.*;

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
}
