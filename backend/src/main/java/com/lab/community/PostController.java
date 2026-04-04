package com.lab.community;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/community/posts")
public class PostController {

    @GetMapping
    public ApiResponse<?> list() {
        return ApiResponse.success(Map.of("content", List.of(), "total", 0));
    }

    @PostMapping
    public ApiResponse<?> create(@RequestBody Map<String, Object> body) {
        Map<String, Object> post = new HashMap<>(body);
        post.put("id", UUID.randomUUID().toString());
        post.put("createdAt", new Date().toString());
        post.put("likeCount", 0);
        post.put("commentCount", 0);
        return ApiResponse.success(post);
    }

    @GetMapping("/{id}")
    public ApiResponse<?> get(@PathVariable String id) {
        return ApiResponse.success(Map.of("id", id, "title", "", "content", ""));
    }
}
