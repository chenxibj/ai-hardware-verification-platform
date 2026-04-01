package com.lab.user;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import com.lab.audit.AuditService;
import java.util.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditService auditService;

    @GetMapping
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status) {
        Page<User> users;
        if (status != null) {
            users = userRepository.findByStatus(User.Status.valueOf(status), PageRequest.of(page, size));
        } else {
            users = userRepository.findAll(PageRequest.of(page, size));
        }
        Map<String, Object> res = new HashMap<>();
        res.put("code", 0); res.put("message", "success");
        res.put("data", users.getContent().stream().map(this::safeUser).collect(Collectors.toList()));
        res.put("total", users.getTotalElements()); res.put("page", page); res.put("size", size);
        return ResponseEntity.ok(res);
    }


    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, String> body, @AuthenticationPrincipal User admin) {
        if (!"ADMIN".equals(admin.getRole())) {
            return ResponseEntity.status(403).body(Map.of("code", 1003, "message", "Permission denied"));
        }
        String username = body.get("username");
        String email = body.get("email");
        String password = body.getOrDefault("password", "ahvp123456");
        String role = body.getOrDefault("role", "USER");
        String phone = body.get("phone");
        if (username == null || email == null) {
            return ResponseEntity.badRequest().body(Map.of("code", 1001, "message", "用户名和邮箱不能为空"));
        }
        if (userRepository.findByUsername(username).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("code", 1002, "message", "用户名已存在"));
        }
        if (userRepository.existsByEmail(email)) {
            return ResponseEntity.badRequest().body(Map.of("code", 1002, "message", "邮箱已被注册"));
        }
        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(password));
        user.setRole(role);
        user.setPhone(phone);
        user.setStatus(User.Status.ACTIVE);
        userRepository.save(user);
        auditService.log(admin.getId(), admin.getUsername(), "CREATE", "USER", user.getId(), "创建用户: " + username);
        return ResponseEntity.ok(Map.of("code", 0, "message", "success", "data", safeUser(user)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getById(@PathVariable Long id) {
        return userRepository.findById(id)
            .map(u -> ResponseEntity.ok(Map.<String, Object>of("code", 0, "message", "success", "data", safeUser(u))))
            .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/role")
    public ResponseEntity<Map<String, Object>> updateRole(@PathVariable Long id, @RequestBody Map<String, String> body, @AuthenticationPrincipal User admin) {
        if (!"ADMIN".equals(admin.getRole())) {
            return ResponseEntity.status(403).body(Map.of("code", 1003, "message", "Permission denied"));
        }
        User user = userRepository.findById(id).orElseThrow(() -> new RuntimeException("User not found"));
        user.setRole(body.get("role"));
        userRepository.save(user);
        auditService.log(admin.getId(), admin.getUsername(), "UPDATE", "USER", user.getId(), "修改角色为: " + body.get("role"));
        return ResponseEntity.ok(Map.of("code", 0, "message", "success", "data", safeUser(user)));
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<Map<String, Object>> updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body, @AuthenticationPrincipal User admin) {
        if (!"ADMIN".equals(admin.getRole())) {
            return ResponseEntity.status(403).body(Map.of("code", 1003, "message", "Permission denied"));
        }
        User user = userRepository.findById(id).orElseThrow(() -> new RuntimeException("User not found"));
        user.setStatus(User.Status.valueOf(body.get("status")));
        userRepository.save(user);
        auditService.log(admin.getId(), admin.getUsername(), "UPDATE", "USER", user.getId(), "修改状态为: " + body.get("status"));
        return ResponseEntity.ok(Map.of("code", 0, "message", "success", "data", safeUser(user)));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        long total = userRepository.count();
        long active = userRepository.countByStatus(User.Status.ACTIVE);
        return ResponseEntity.ok(Map.of("code", 0, "data", Map.of("total", total, "active", active, "inactive", total - active)));
    }

    private Map<String, Object> safeUser(User u) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", u.getId()); m.put("username", u.getUsername()); m.put("email", u.getEmail());
        m.put("role", u.getRole()); m.put("status", u.getStatus().name()); m.put("phone", u.getPhone());
        m.put("createdAt", u.getCreatedAt()); m.put("lastLoginAt", u.getLastLoginAt());
        return m;
    }
}
