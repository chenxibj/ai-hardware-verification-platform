package com.lab.feedback;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/feedback")
public class FeedbackController {

    @PostMapping
    public ApiResponse<?> submit(@RequestBody Map<String, Object> body) {
        return ApiResponse.ok(Map.of(
            "id", UUID.randomUUID().toString(),
            "status", "RECEIVED",
            "message", "感谢您的反馈"
        ));
    }
}
