package com.lab.user;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/users/me/points")
public class UserPointsController {

    @GetMapping
    public ApiResponse<?> getPoints() {
        return ApiResponse.ok(Map.of(
            "total", 0,
            "records", List.of()
        ));
    }
}
