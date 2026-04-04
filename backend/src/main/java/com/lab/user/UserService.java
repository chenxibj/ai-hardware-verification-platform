package com.lab.user;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    private static final java.util.Set<String> VALID_ROLES = java.util.Set.of(
            "super_admin", "tenant_admin", "engineer", "product_mgr", "viewer"
    );

    /**
     * 注册用户
     */
    @Transactional
    public User register(String email, String password, String username, String org, String role) {
        // 邮箱唯一校验
        if (userRepository.existsByEmail(email)) {
            throw new RuntimeException("该邮箱已注册: " + email);
        }
        // 用户名唯一校验
        if (userRepository.findByUsername(username).isPresent()) {
            throw new RuntimeException("用户名已被使用: " + username);
        }
        // 用户名长度校验
        if (username.length() < 4 || username.length() > 30) {
            throw new RuntimeException("用户名长度需在4-30个字符之间");
        }
        // 密码强度校验
        validatePassword(password);

        // 角色校验
        String finalRole = (role != null && VALID_ROLES.contains(role)) ? role : "engineer";

        User user = new User();
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(password));
        user.setUsername(username);
        user.setOrg(org);
        user.setRole(finalRole);
        user.setUserType(finalRole);
        user.setStatus(User.Status.ACTIVE);
        user.setEmailVerified(false);
        user.setPhoneVerified(false);

        User saved = userRepository.save(user);
        log.info("User registered: {} ({}) role={}", saved.getUsername(), saved.getEmail(), saved.getRole());
        return saved;
    }

    /**
     * 注册用户 (向后兼容3参数版)
     */
    public User register(String email, String password, String username) {
        return register(email, password, username, null, "engineer");
    }

    /**
     * 密码校验: 8-32字符, 含大写+小写+数字
     */
    private void validatePassword(String password) {
        if (password == null || password.length() < 8 || password.length() > 32) {
            throw new RuntimeException("密码长度需在8-32个字符之间");
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new RuntimeException("密码必须包含大写字母");
        }
        if (!password.matches(".*[a-z].*")) {
            throw new RuntimeException("密码必须包含小写字母");
        }
        if (!password.matches(".*[0-9].*")) {
            throw new RuntimeException("密码必须包含数字");
        }
    }

    /**
     * 登录认证
     */
    public User authenticate(String email, String password) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("邮箱或密码错误"));

        if (user.getStatus() == User.Status.LOCKED) {
            throw new RuntimeException("账号已被锁定，请联系管理员");
        }

        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("邮箱或密码错误");
        }

        // 更新最后登录时间
        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        return user;
    }

    public Optional<User> findById(Long id) {
        return userRepository.findById(id);
    }

    public Optional<User> findByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    /**
     * 用户列表（分页）
     */
    @Transactional(readOnly = true)
    public Page<User> listUsers(Pageable pageable) {
        return userRepository.findAll(pageable);
    }

    /**
     * 创建用户（管理员操作）
     */
    @Transactional
    public User createUser(String username, String email, String password, String phone, String role) {
        if (userRepository.existsByEmail(email)) {
            throw new RuntimeException("该邮箱已注册: " + email);
        }
        String finalRole = (role != null && VALID_ROLES.contains(role)) ? role : "engineer";

        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(password != null ? password : "Ahvp123456"));
        user.setPhone(phone);
        user.setRole(finalRole);
        user.setUserType(finalRole);
        user.setStatus(User.Status.ACTIVE);
        user.setEmailVerified(false);
        user.setPhoneVerified(false);

        return userRepository.save(user);
    }

    /**
     * 更新角色
     */
    @Transactional
    public User updateRole(Long id, String role) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("用户不存在: " + id));
        if (VALID_ROLES.contains(role)) {
            user.setRole(role);
            user.setUserType(role);
        }
        return userRepository.save(user);
    }

    /**
     * 更新状态
     */
    @Transactional
    public User updateStatus(Long id, String status) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("用户不存在: " + id));
        user.setStatus(User.Status.valueOf(status));
        return userRepository.save(user);
    }

    /**
     * 用户统计
     */
    public java.util.Map<String, Long> getStats() {
        java.util.Map<String, Long> stats = new java.util.HashMap<>();
        stats.put("total", userRepository.count());
        stats.put("active", userRepository.countByStatus(User.Status.ACTIVE));
        stats.put("inactive", userRepository.countByStatus(User.Status.LOCKED));
        return stats;
    }

    /**
     * 初始化管理员用户
     */
    public void initAdminUser() {
        if (!userRepository.existsByEmail("admin@ahvp.com")) {
            User admin = new User();
            admin.setEmail("admin@ahvp.com");
            admin.setPassword(passwordEncoder.encode("Admin123456"));
            admin.setUsername("admin");
            admin.setRole("super_admin");
            admin.setUserType("super_admin");
            admin.setStatus(User.Status.ACTIVE);
            admin.setEmailVerified(true);
            admin.setPhoneVerified(false);
            userRepository.save(admin);
            log.info("Admin user initialized");
        }
        // 确保测试账号存在
        if (!userRepository.existsByEmail("test@ahvp.com")) {
            User test = new User();
            test.setEmail("test@ahvp.com");
            test.setPassword(passwordEncoder.encode("Test1234"));
            test.setUsername("test");
            test.setRole("engineer");
            test.setUserType("engineer");
            test.setStatus(User.Status.ACTIVE);
            test.setEmailVerified(false);
            test.setPhoneVerified(false);
            userRepository.save(test);
            log.info("Test user initialized");
        }
    }
}
