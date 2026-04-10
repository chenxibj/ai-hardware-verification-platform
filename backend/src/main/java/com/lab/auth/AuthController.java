package com.lab.auth;

import com.lab.common.ApiResponse;
import com.lab.config.JwtTokenProvider;
import com.lab.user.User;
import com.lab.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {
    private final UserService userService;
    private final JwtTokenProvider tokenProvider;

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody RegisterRequest request) {
        try {
            User user = userService.register(
                    request.getEmail(),
                    request.getPassword(),
                    request.getUsername(),
                    request.getOrg(),
                    request.getRole());
            String token = tokenProvider.generateToken(user.getId(), user.getEmail(), user.getRole(), user.getTenantId());
            String refreshToken = tokenProvider.generateRefreshToken(user.getId());
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "注册成功");
            response.put("data", Map.of("token", token, "refreshToken", refreshToken, "user", userToMap(user)));
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("code", 1001, "message", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody LoginRequest request) {
        try {
            User user = userService.authenticate(request.getEmail(), request.getPassword());
            String token = tokenProvider.generateToken(user.getId(), user.getEmail(), user.getRole(), user.getTenantId());
            String refreshToken = tokenProvider.generateRefreshToken(user.getId());
            Map<String, Object> response = new HashMap<>();
            response.put("code", 0);
            response.put("message", "登录成功");
            response.put("data", Map.of("token", token, "refreshToken", refreshToken, "expiresIn", 86400, "user", userToMap(user)));
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("code", 1002, "message", e.getMessage()));
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, Object>> refresh(@RequestBody Map<String, String> request) {
        String rt = request.get("refreshToken");
        if (rt == null || rt.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("code", 1003, "message", "refreshToken is required"));
        }
        try {
            if (!tokenProvider.validateToken(rt)) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("code", 1004, "message", "Invalid or expired refresh token"));
            }
            Long userId = tokenProvider.getUserIdFromToken(rt);
            User user = userService.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
            String newToken = tokenProvider.generateToken(user.getId(), user.getEmail(), user.getRole(), user.getTenantId());
            String newRt = tokenProvider.generateRefreshToken(user.getId());
            return ResponseEntity.ok(Map.of("code", 0, "message", "success", "data", Map.of("token", newToken, "refreshToken", newRt, "expiresIn", 86400)));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("code", 1004, "message", "Invalid refresh token"));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser(@AuthenticationPrincipal User user) {
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("code", 1005, "message", "Not authenticated"));
        return ResponseEntity.ok(Map.of("code", 0, "message", "success", "data", userToMap(user)));
    }


    @GetMapping("/profile")
    public ResponseEntity<Map<String, Object>> getProfile(@AuthenticationPrincipal User user) {
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("code", 1005, "message", "Not authenticated"));
        return ResponseEntity.ok(Map.of("code", 0, "message", "success", "data", userToMap(user)));
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout() {
        return ResponseEntity.ok(Map.of("code", 0, "message", "已退出登录"));
    }

    private Map<String, Object> userToMap(User user) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", user.getId());
        m.put("email", user.getEmail());
        m.put("username", user.getUsername());
        m.put("role", user.getRole());
        m.put("org", user.getOrg());
        m.put("status", user.getStatus().name());
        m.put("avatar", user.getAvatar());
        m.put("tenantId", user.getTenantId());
        m.put("createdAt", user.getCreatedAt());
        return m;
    }

    @Data
    public static class RegisterRequest {
        @NotBlank @Email private String email;
        @NotBlank @Size(min = 8, max = 32) private String password;
        @NotBlank @Size(min = 4, max = 30) private String username;
        private String org;
        private String role;
    }

    @Data
    public static class LoginRequest {
        @NotBlank private String email;
        @NotBlank private String password;
    }
}
