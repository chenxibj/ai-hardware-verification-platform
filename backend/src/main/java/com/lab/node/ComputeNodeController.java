package com.lab.node;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/nodes")
public class ComputeNodeController {

    private final ComputeNodeService service;

    public ComputeNodeController(ComputeNodeService service) {
        this.service = service;
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
