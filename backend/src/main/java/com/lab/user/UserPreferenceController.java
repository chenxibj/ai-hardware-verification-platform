package com.lab.user;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/users/me/preferences")
public class UserPreferenceController {

    private Map<String, Object> prefs = new HashMap<>(Map.of(
        "theme", "light",
        "language", "zh-CN",
        "emailNotify", true,
        "smsNotify", false,
        "browserNotify", true
    ));

    @GetMapping
    public ApiResponse<?> getPreferences() {
        return ApiResponse.ok(prefs);
    }

    @PutMapping
    public ApiResponse<?> updatePreferences(@RequestBody Map<String, Object> body) {
        prefs.putAll(body);
        return ApiResponse.ok(prefs);
    }
}
