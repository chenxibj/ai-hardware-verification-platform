package com.lab.feedback;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/feedback")
public class FeedbackController {

    @PostMapping
    public ApiResponse<?> submit(@RequestBody Map<String, Object> body) {
        return ApiResponse.success(Map.of(
            "id", UUID.randomUUID().toString(),
            "status", "RECEIVED",
            "message", "感谢您的反馈"
        ));
    }
}
