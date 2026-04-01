package com.lab.user;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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

    @Transactional
    public User register(String email, String password, String username) {
        if (userRepository.existsByEmail(email)) {
            throw new RuntimeException("Email already registered: " + email);
        }
        if (userRepository.findByUsername(username).isPresent()) {
            throw new RuntimeException("Username already taken: " + username);
        }
        User user = new User();
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(password));
        user.setUsername(username);
        user.setRole("USER");
        user.setStatus(User.Status.ACTIVE);
        user.setEmailVerified(false);
        user.setPhoneVerified(false);
        User saved = userRepository.save(user);
        log.info("User registered: {} ({})", saved.getUsername(), saved.getEmail());
        return saved;
    }

    @Transactional
    public User authenticate(String email, String password) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));
        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("Invalid email or password");
        }
        if (user.getStatus() != User.Status.ACTIVE) {
            throw new RuntimeException("Account is " + user.getStatus().name().toLowerCase());
        }
        user.setLastLoginAt(Instant.now());
        userRepository.save(user);
        return user;
    }

    public Optional<User> findById(Long id) { return userRepository.findById(id); }
    public Optional<User> findByEmail(String email) { return userRepository.findByEmail(email); }

    @Transactional
    public void initAdminUser() {
        if (!userRepository.existsByEmail("admin@ahvp.com")) {
            User admin = new User();
            admin.setEmail("admin@ahvp.com");
            admin.setPassword(passwordEncoder.encode("admin123"));
            admin.setUsername("admin");
            admin.setRole("ADMIN");
            admin.setStatus(User.Status.ACTIVE);
            admin.setEmailVerified(true);
            userRepository.save(admin);
            log.info("Admin user initialized: admin@ahvp.com / admin123");
        }
    }
}
