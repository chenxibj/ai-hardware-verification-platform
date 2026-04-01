package com.lab.system;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.bind.annotation.*;
import javax.sql.DataSource;
import java.sql.Connection;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/health")
@RequiredArgsConstructor
public class HealthController {
    private final DataSource dataSource;
    private final StringRedisTemplate redisTemplate;

    @GetMapping
    public Map<String, Object> health() {
        Map<String, Object> result = new HashMap<>();
        result.put("status", "UP");
        Map<String, Object> components = new HashMap<>();
        try (Connection conn = dataSource.getConnection()) {
            components.put("db", Map.of("status", "UP", "database", conn.getMetaData().getDatabaseProductName()));
        } catch (Exception e) {
            components.put("db", Map.of("status", "DOWN", "error", e.getMessage()));
            result.put("status", "DOWN");
        }
        try { redisTemplate.getConnectionFactory().getConnection().ping(); components.put("redis", Map.of("status", "UP")); }
        catch (Exception e) { components.put("redis", Map.of("status", "DOWN", "error", e.getMessage())); }
        result.put("components", components);
        return result;
    }

    @GetMapping("/ping")
    public Map<String, String> ping() { return Map.of("status", "OK", "message", "pong"); }

    @GetMapping("/db")
    public Map<String, Object> dbHealth() {
        try (Connection conn = dataSource.getConnection()) {
            return Map.of("status", "UP", "database", conn.getMetaData().getDatabaseProductName());
        } catch (Exception e) { return Map.of("status", "DOWN", "error", e.getMessage()); }
    }
}
