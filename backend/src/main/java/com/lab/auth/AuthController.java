package com.lab.auth;

import com.lab.common.ApiResponse;
import com.lab.common.BusinessException;
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
    public ResponseEntity<ApiResponse<Map<String, Object>>> register(@Valid @RequestBody RegisterRequest request) {
        User user = userService.register(
                request.getEmail(),
                request.getPassword(),
                request.getUsername(),
                request.getOrganization(),
                request.getPhone(),
                request.getRole()
        );
        String token = tokenProvider.generateToken(user.getId(), user.getEmail(), user.getRole());
        String refreshToken = tokenProvider.generateRefreshToken(user.getId());
        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("refreshToken", refreshToken);
        data.put("user", userToMap(user));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(data));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<Map<String, Object>>> login(@Valid @RequestBody LoginRequest request) {
        User user = userService.authenticate(request.getEmail(), request.getPassword());
        String token = tokenProvider.generateToken(user.getId(), user.getEmail(), user.getRole());
        String refreshToken = tokenProvider.generateRefreshToken(user.getId());
        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("refreshToken", refreshToken);
        data.put("expiresIn", 86400);
        data.put("user", userToMap(user));
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<Map<String, Object>>> refresh(@RequestBody Map<String, String> request) {
        String rt = request.get("refreshToken");
        if (rt == null || rt.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("AUTH-009", "refreshToken is required"));
        }
        try {
            if (!tokenProvider.validateToken(rt)) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("AUTH-010", "Invalid or expired refresh token"));
            }
            Long userId = tokenProvider.getUserIdFromToken(rt);
            User user = userService.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
            String newToken = tokenProvider.generateToken(user.getId(), user.getEmail(), user.getRole());
            String newRt = tokenProvider.generateRefreshToken(user.getId());
            Map<String, Object> data = Map.of("token", newToken, "refreshToken", newRt, "expiresIn", 86400);
            return ResponseEntity.ok(ApiResponse.ok(data));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("AUTH-010", "Invalid refresh token"));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCurrentUser(@AuthenticationPrincipal User user) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("AUTH-011", "Not authenticated"));
        }
        return ResponseEntity.ok(ApiResponse.ok(userToMap(user)));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout() {
        return ResponseEntity.ok(ApiResponse.ok());
    }

    private Map<String, Object> userToMap(User user) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", user.getId());
        m.put("email", user.getEmail());
        m.put("username", user.getUsername());
        m.put("role", user.getRole());
        m.put("status", user.getStatus().name());
        m.put("avatar", user.getAvatar());
        m.put("organization", user.getOrganization());
        m.put("phone", user.getPhone());
        m.put("createdAt", user.getCreatedAt());
        return m;
    }

    @Data
    public static class RegisterRequest {
        @NotBlank(message = "邮箱不能为空")
        @Email(message = "邮箱格式不正确")
        private String email;

        @NotBlank(message = "密码不能为空")
        private String password;

        @NotBlank(message = "用户名不能为空")
        private String username;

        @NotBlank(message = "组织/单位不能为空")
        @Size(max = 200, message = "组织名称不超过200字符")
        private String organization;

        private String phone;

        private String role;
    }

    @Data
    public static class LoginRequest {
        @NotBlank private String email;
        @NotBlank private String password;
    }
}
