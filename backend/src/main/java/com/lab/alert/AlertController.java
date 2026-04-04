package com.lab.alert;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 告警 Controller
 * @feat #176 资源监控与运维 (US-5.3)
 */
@RestController
@RequestMapping("/alerts")
public class AlertController {

    private final AlertService alertService;

    public AlertController(AlertService alertService) {
        this.alertService = alertService;
    }

    /**
     * 告警列表
     */
    @GetMapping
    public ApiResponse<List<Alert>> list(
            @RequestParam(required = false) Long nodeId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String level) {
        return ApiResponse.ok(alertService.list(nodeId, status, level));
    }

    /**
     * 确认告警
     */
    @PostMapping("/{id}/acknowledge")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Alert> acknowledge(@PathVariable Long id) {
        return ApiResponse.ok(alertService.acknowledge(id));
    }
}
