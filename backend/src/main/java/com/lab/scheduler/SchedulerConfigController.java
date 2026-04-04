package com.lab.scheduler;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/admin/scheduler-config")
public class SchedulerConfigController {

    private Map<String, Object> config = new HashMap<>(Map.of(
        "priorityStrategy", "FIFO",
        "maxConcurrency", 4,
        "retryStrategy", "FIXED",
        "retryMaxAttempts", 3
    ));

    @GetMapping
    public ApiResponse<?> getConfig() {
        return ApiResponse.success(config);
    }

    @PutMapping
    public ApiResponse<?> updateConfig(@RequestBody Map<String, Object> body) {
        config.putAll(body);
        return ApiResponse.success(config);
    }
}
