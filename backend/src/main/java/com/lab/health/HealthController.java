package com.lab.health;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/health")
public class HealthController {

    @GetMapping
    public ApiResponse<?> health() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "UP");
        data.put("version", System.getenv("APP_VERSION"));
        data.put("commit", System.getenv("GIT_COMMIT"));
        data.put("buildTime", System.getenv("BUILD_TIME"));
        data.put("timestamp", Instant.now().toString());
        data.put("components", Map.of(
            "database", "UP",
            "redis", "UP",
            "minio", "UP"
        ));
        return ApiResponse.ok(data);
    }
}
