package com.lab.health;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/health")
public class HealthController {

    @GetMapping
    public ApiResponse<?> health() {
        return ApiResponse.ok(Map.of(
            "status", "UP",
            "timestamp", System.currentTimeMillis(),
            "version", "3.2.0",
            "components", Map.of(
                "database", "UP",
                "redis", "UP",
                "minio", "UP"
            )
        ));
    }
}
