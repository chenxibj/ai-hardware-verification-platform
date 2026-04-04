package com.lab.user;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final Duration LOCK_DURATION = Duration.ofHours(1);
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[a-zA-Z0-9_]{4,30}$");
    private static final Pattern PASSWORD_UPPER = Pattern.compile("[A-Z]");
    private static final Pattern PASSWORD_LOWER = Pattern.compile("[a-z]");
    private static final Pattern PASSWORD_DIGIT = Pattern.compile("[0-9]");

    public User register(String email, String password, String username) {
        return register(email, password, username, null, null, null);
    }

    @Transactional
    public User register(String email, String password, String username,
                         String organization, String phone, String role) {
        // Username validation
        if (username == null || !USERNAME_PATTERN.matcher(username).matches()) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_USERNAME);
        }

        // Password validation
        if (password == null || password.length() < 8 || password.length() > 32
                || !PASSWORD_UPPER.matcher(password).find()
                || !PASSWORD_LOWER.matcher(password).find()
                || !PASSWORD_DIGIT.matcher(password).find()) {
            throw new BusinessException(ErrorCode.AUTH_WEAK_PASSWORD);
        }

        // Organization validation
        if (organization == null || organization.trim().isEmpty()) {
            throw new BusinessException(ErrorCode.AUTH_ORGANIZATION_REQUIRED);
        }

        // Uniqueness check
        if (userRepository.existsByEmail(email)) {
            throw new BusinessException(ErrorCode.AUTH_EMAIL_EXISTS);
        }
        if (userRepository.findByUsername(username).isPresent()) {
            throw new BusinessException(ErrorCode.AUTH_USERNAME_EXISTS);
        }

        // Determine role (default ENGINEER)
        String assignedRole = "ENGINEER";
        if (role != null && !role.trim().isEmpty()) {
            String upper = role.trim().toUpperCase();
            // Only allow non-admin roles during self-registration
            if ("ENGINEER".equals(upper) || "PRODUCT_MGR".equals(upper) || "VIEWER".equals(upper)) {
                assignedRole = upper;
            }
        }

        User user = new User();
        user.setEmail(email.trim().toLowerCase());
        user.setPassword(passwordEncoder.encode(password));
        user.setUsername(username.trim());
        user.setOrganization(organization.trim());
        user.setPhone(phone != null ? phone.trim() : null);
        user.setRole(assignedRole);
        user.setStatus(User.Status.ACTIVE);
        user.setEmailVerified(false);
        user.setPhoneVerified(false);
        user.setFailedAttempts(0);

        User saved = userRepository.save(user);
        log.info("User registered: {} ({}) with role {} org={}", saved.getUsername(), saved.getEmail(), assignedRole, organization);
        return saved;
    }

    /**
     * Record login failure (separate transaction so it commits even when we throw)
     */
    @Transactional
    public void recordLoginFailure(User user) {
        int attempts = (user.getFailedAttempts() == null ? 0 : user.getFailedAttempts()) + 1;
        user.setFailedAttempts(attempts);
        if (attempts >= MAX_FAILED_ATTEMPTS) {
            user.setLockedUntil(Instant.now().plus(LOCK_DURATION));
        }
        userRepository.save(user);
        log.warn("Login failed for user {} ({}): attempt #{}", user.getUsername(), user.getEmail(), attempts);
    }

    /**
     * Authenticate user, throwing appropriate error on failure.
     * Login failures are persisted in a separate method to avoid rollback.
     */
    public User authenticate(String email, String password) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS));

        // Check if account is locked
        if (user.isLocked()) {
            long remainingSeconds = Duration.between(Instant.now(), user.getLockedUntil()).getSeconds();
            long remainingMinutes = (remainingSeconds + 59) / 60;
            throw new BusinessException(ErrorCode.AUTH_ACCOUNT_LOCKED,
                    "账户已锁定，请在" + remainingMinutes + "分钟后再试");
        }

        if (!passwordEncoder.matches(password, user.getPassword())) {
            // Record failure in a separate transaction
            recordLoginFailure(user);

            int attempts = user.getFailedAttempts(); // already incremented by recordLoginFailure
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                throw new BusinessException(ErrorCode.AUTH_ACCOUNT_LOCKED,
                        "连续" + MAX_FAILED_ATTEMPTS + "次密码错误，账户已锁定1小时");
            }
            int remaining = MAX_FAILED_ATTEMPTS - attempts;
            throw new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS,
                    "用户名或密码错误，还可尝试" + remaining + "次");
        }

        // Login success: reset failed attempts
        if (user.getFailedAttempts() != null && user.getFailedAttempts() > 0) {
            user.setFailedAttempts(0);
            user.setLockedUntil(null);
        }
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

    public void initAdminUser() {
        if (!userRepository.existsByEmail("admin@ahvp.com")) {
            User admin = new User();
            admin.setEmail("admin@ahvp.com");
            admin.setPassword(passwordEncoder.encode("admin123"));
            admin.setUsername("admin");
            admin.setRole("SUPER_ADMIN");
            admin.setOrganization("System");
            admin.setStatus(User.Status.ACTIVE);
            admin.setEmailVerified(true);
            admin.setPhoneVerified(false);
            admin.setFailedAttempts(0);
            userRepository.save(admin);
            log.info("Admin user initialized with SUPER_ADMIN role");
        }
    }
}
