package com.lab.tenant;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 租户管理 Controller
 * @feat #174 多租户管理 (US-4.2)
 */
@RestController
@RequestMapping("/tenants")
public class TenantController {

    private final TenantService tenantService;

    public TenantController(TenantService tenantService) {
        this.tenantService = tenantService;
    }

    /**
     * 创建租户
     */
    @PostMapping
    @RequireRole(Role.SUPER_ADMIN)
    public ApiResponse<Tenant> create(@RequestBody TenantCreateRequest request) {
        return ApiResponse.ok(tenantService.create(request));
    }

    /**
     * 租户列表（仅管理员）
     */
    @GetMapping
    @RequireRole(Role.SUPER_ADMIN)
    public ApiResponse<List<Tenant>> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.ok(tenantService.list(status, keyword));
    }

    /**
     * 租户详情
     */
    @GetMapping("/{id}")
    @RequireRole(Role.TENANT_ADMIN)
    public ApiResponse<Tenant> getById(@PathVariable Long id) {
        return ApiResponse.ok(tenantService.getById(id));
    }

    /**
     * 更新租户（配额/状态）
     */
    @PutMapping("/{id}")
    @RequireRole(Role.SUPER_ADMIN)
    public ApiResponse<Tenant> update(@PathVariable Long id, @RequestBody TenantUpdateRequest request) {
        return ApiResponse.ok(tenantService.update(id, request));
    }
}
