package com.lab.tenant;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 多租户管理控制器
 * Issue: #174
 */
@Slf4j
@RestController
@RequestMapping("/tenants")
@RequiredArgsConstructor
public class TenantController {

    private final TenantService tenantService;

    /**
     * 租户列表 — 仅 SUPER_ADMIN
     */
    @GetMapping
    @RequireRole(Role.SUPER_ADMIN)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> list() {
        return ResponseEntity.ok(ApiResponse.ok(tenantService.listWithUserCount()));
    }

    /**
     * 租户详情
     */
    @GetMapping("/{id}")
    @RequireRole(Role.SUPER_ADMIN)
    public ResponseEntity<ApiResponse<Tenant>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(tenantService.getById(id)));
    }

    /**
     * 创建租户
     */
    @PostMapping
    @RequireRole(Role.SUPER_ADMIN)
    public ResponseEntity<ApiResponse<Tenant>> create(@RequestBody Tenant tenant) {
        return ResponseEntity.ok(ApiResponse.ok(tenantService.create(tenant)));
    }

    /**
     * 更新租户
     */
    @PutMapping("/{id}")
    @RequireRole(Role.SUPER_ADMIN)
    public ResponseEntity<ApiResponse<Tenant>> update(@PathVariable Long id, @RequestBody Tenant tenant) {
        return ResponseEntity.ok(ApiResponse.ok(tenantService.update(id, tenant)));
    }

    /**
     * 删除租户
     */
    @DeleteMapping("/{id}")
    @RequireRole(Role.SUPER_ADMIN)
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        tenantService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok());
    }
}
