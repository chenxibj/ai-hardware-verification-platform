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
}
