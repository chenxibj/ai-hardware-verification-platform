package com.lab.resource;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 资源池管理 Controller
 * @feat #175 资源池管理与调度 (US-5.2)
 */
@RestController
@RequestMapping("/resource-pools")
public class ResourcePoolController {

    private final ResourcePoolService service;

    public ResourcePoolController(ResourcePoolService service) {
        this.service = service;
    }

    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ApiResponse<ResourcePool> create(@RequestBody ResourcePoolRequest request) {
        return ApiResponse.ok(service.create(request));
    }

    @GetMapping
    public ApiResponse<List<ResourcePool>> list(
            @RequestParam(required = false) String status) {
        return ApiResponse.ok(service.list(status));
    }

    @GetMapping("/{id}")
    public ApiResponse<ResourcePool> getById(@PathVariable Long id) {
        return ApiResponse.ok(service.getById(id));
    }

    @PutMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<ResourcePool> update(@PathVariable Long id, @RequestBody ResourcePoolRequest request) {
        return ApiResponse.ok(service.update(id, request));
    }

    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok();
    }

    /**
     * 分配节点到资源池
     */
    @PostMapping("/{id}/nodes")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<ResourcePool> assignNodes(@PathVariable Long id, @RequestBody NodeAssignRequest request) {
        return ApiResponse.ok(service.assignNodes(id, request.getNodeIds()));
    }
}
