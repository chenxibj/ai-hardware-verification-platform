package com.lab.admin;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import com.lab.user.User;
import com.lab.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

import java.lang.management.ManagementFactory;
import java.lang.management.RuntimeMXBean;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 管理后台控制器 (#323)
 */
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminController {

    private final UserRepository userRepo;

    /** GET /admin/users — 用户列表 */
    @GetMapping("/users")
    @RequireRole(Role.TENANT_ADMIN)
    public ApiResponse<Object> listUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status) {

        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<User> users;
        if (status != null && !status.isBlank()) {
            try {
                users = userRepo.findByStatus(User.Status.valueOf(status), pageable);
            } catch (Exception e) {
                users = userRepo.findAll(pageable);
            }
        } else {
            users = userRepo.findAll(pageable);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("records", users.getContent());
        data.put("total", users.getTotalElements());
        data.put("page", page);
        data.put("size", size);
        return ApiResponse.ok(data);
    }

    /** GET /admin/settings — 系统设置 */
    @GetMapping("/settings")
    @RequireRole(Role.TENANT_ADMIN)
    public ApiResponse<Map<String, Object>> getSettings() {
        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("siteName", "AI硬件评测平台");
        settings.put("version", "1.0.0");
        settings.put("maxUploadSize", "100MB");
        settings.put("sessionTimeout", 3600);
        settings.put("defaultPageSize", 20);
        settings.put("enableRegistration", true);
        settings.put("enableNotifications", true);
        return ApiResponse.ok(settings);
    }

    /** GET /admin/system — 系统信息 */
    @GetMapping("/system")
    @RequireRole(Role.TENANT_ADMIN)
    public ApiResponse<Map<String, Object>> getSystemInfo() {
        Runtime runtime = Runtime.getRuntime();
        RuntimeMXBean runtimeMX = ManagementFactory.getRuntimeMXBean();

        Map<String, Object> info = new LinkedHashMap<>();
        info.put("javaVersion", System.getProperty("java.version"));
        info.put("javaVendor", System.getProperty("java.vendor"));
        info.put("osName", System.getProperty("os.name"));
        info.put("osArch", System.getProperty("os.arch"));
        info.put("osVersion", System.getProperty("os.version"));
        info.put("availableProcessors", runtime.availableProcessors());
        info.put("totalMemoryMB", runtime.totalMemory() / (1024 * 1024));
        info.put("freeMemoryMB", runtime.freeMemory() / (1024 * 1024));
        info.put("maxMemoryMB", runtime.maxMemory() / (1024 * 1024));
        info.put("usedMemoryMB", (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024));
        info.put("uptimeMs", runtimeMX.getUptime());
        info.put("startTime", runtimeMX.getStartTime());
        info.put("totalUsers", userRepo.count());
        info.put("activeUsers", userRepo.countByStatus(User.Status.ACTIVE));
        return ApiResponse.ok(info);
    }
}
