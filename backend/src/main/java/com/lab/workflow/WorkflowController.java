package com.lab.workflow;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/workflows")
public class WorkflowController {

    @GetMapping
    public ApiResponse<?> list() {
        return ApiResponse.ok(Map.of("content", List.of(), "total", 0));
    }

    @PostMapping
    public ApiResponse<?> create(@RequestBody Map<String, Object> body) {
        return ApiResponse.ok(Map.of("id", UUID.randomUUID().toString(), "status", "DRAFT"));
    }

    @GetMapping("/{id}")
    public ApiResponse<?> get(@PathVariable String id) {
        return ApiResponse.ok(Map.of("id", id, "name", "示例流程", "status", "DRAFT", "nodes", List.of()));
    }

    @PutMapping("/{id}")
    public ApiResponse<?> update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return ApiResponse.ok(Map.of("id", id, "updated", true));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<?> delete(@PathVariable String id) {
        return ApiResponse.ok(Map.of("deleted", true));
    }
}
