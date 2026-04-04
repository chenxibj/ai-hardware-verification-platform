package com.lab.community;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/community/demands")
public class DemandController {

    @GetMapping
    public ApiResponse<?> list() {
        return ApiResponse.ok(Map.of("content", List.of(), "total", 0));
    }

    @PostMapping
    public ApiResponse<?> create(@RequestBody Map<String, Object> body) {
        Map<String, Object> demand = new HashMap<>(body);
        demand.put("id", UUID.randomUUID().toString());
        demand.put("status", "OPEN");
        demand.put("createdAt", new Date().toString());
        return ApiResponse.ok(demand);
    }
}
