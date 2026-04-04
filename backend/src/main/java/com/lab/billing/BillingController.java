package com.lab.billing;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/billing")
public class BillingController {

    @GetMapping("/plans")
    public ApiResponse<?> getPlans() {
        return ApiResponse.ok(List.of(
            Map.of("id", "free", "name", "免费版", "price", 0, "features", List.of("基础评测", "5个芯片")),
            Map.of("id", "pro", "name", "专业版", "price", 999, "features", List.of("高级评测", "无限芯片", "优先支持")),
            Map.of("id", "enterprise", "name", "企业版", "price", -1, "features", List.of("定制化", "私有部署", "7x24支持"))
        ));
    }

    @GetMapping("/usage")
    public ApiResponse<?> getUsage() {
        return ApiResponse.ok(Map.of("plan", "free", "tasksUsed", 0, "tasksLimit", 100));
    }
}
