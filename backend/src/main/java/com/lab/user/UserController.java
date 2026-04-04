package com.lab.user;

import com.lab.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 用户管理控制器（管理员专用）
 */
@Slf4j
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /**
     * 用户列表（仅super_admin/tenant_admin）
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('super_admin', 'tenant_admin')")
    public ApiResponse<Object> listUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<User> users = userService.listUsers(
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        Map<String, Object> result = new HashMap<>();
        result.put("list", users.getContent());
        result.put("total", users.getTotalElements());
        result.put("page", page);
        result.put("size", size);
        return ApiResponse.ok(result);
    }

    /**
     * 创建用户（仅super_admin）
     */
    @PostMapping
    @PreAuthorize("hasRole('super_admin')")
    public ApiResponse<User> createUser(@RequestBody Map<String, String> body) {
        User user = userService.createUser(
                body.get("username"),
                body.get("email"),
                body.get("password"),
                body.get("phone"),
                body.get("role"));
        return ApiResponse.ok(user);
    }

    /**
     * 获取单个用户
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('super_admin', 'tenant_admin')")
    public ApiResponse<User> getUser(@PathVariable Long id) {
        User user = userService.findById(id)
                .orElseThrow(() -> new RuntimeException("用户不存在: " + id));
        return ApiResponse.ok(user);
    }

    /**
     * 更新角色
     */
    @PutMapping("/{id}/role")
    @PreAuthorize("hasRole('super_admin')")
    public ApiResponse<User> updateRole(@PathVariable Long id, @RequestBody Map<String, String> body) {
        User user = userService.updateRole(id, body.get("role"));
        return ApiResponse.ok(user);
    }

    /**
     * 更新状态
     */
    @PutMapping("/{id}/status")
    @PreAuthorize("hasRole('super_admin')")
    public ApiResponse<User> updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        User user = userService.updateStatus(id, body.get("status"));
        return ApiResponse.ok(user);
    }

    /**
     * 用户统计
     */
    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('super_admin', 'tenant_admin')")
    public ApiResponse<Map<String, Long>> getStats() {
        return ApiResponse.ok(userService.getStats());
    }
}
