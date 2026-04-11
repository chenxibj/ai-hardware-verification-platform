package com.lab.resource;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/resource-pools")
public class ResourcePoolController {

    private final ResourcePoolService service;

    public ResourcePoolController(ResourcePoolService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list() {
        return ApiResponse.ok(service.listWithStats());
    }

    @GetMapping("/{id}")
    public ApiResponse<Map<String, Object>> getById(@PathVariable Long id) {
        return ApiResponse.ok(service.getPoolDetail(id));
    }

    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ApiResponse<ResourcePool> create(@RequestBody ResourcePool pool) {
        return ApiResponse.ok(service.create(pool));
    }

    @PutMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<ResourcePool> update(@PathVariable Long id, @RequestBody ResourcePool pool) {
        return ApiResponse.ok(service.update(id, pool));
    }

    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok();
    }

    @PostMapping("/{id}/nodes")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Map<String, Object>> addNode(@PathVariable Long id, @RequestBody Map<String, Long> body) {
        Long nodeId = body.get("nodeId");
        if (nodeId == null) {
            return ApiResponse.error("COMMON-001", "nodeId is required");
        }
        return ApiResponse.ok(service.addNodeToPool(id, nodeId));
    }

    @DeleteMapping("/{id}/nodes/{nodeId}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Void> removeNode(@PathVariable Long id, @PathVariable Long nodeId) {
        service.removeNodeFromPool(id, nodeId);
        return ApiResponse.ok();
    }

    @GetMapping("/{id}/stats")
    public ApiResponse<Map<String, Object>> getStats(@PathVariable Long id) {
        return ApiResponse.ok(service.getPoolStats(id));
    }

    /**
     * #346: 获取资源池关联的运行中和排队中的任务
     */
    @GetMapping("/{id}/tasks")
    public ApiResponse<Map<String, Object>> getPoolTasks(@PathVariable Long id) {
        return ApiResponse.ok(service.getPoolTasks(id));
    }

}
