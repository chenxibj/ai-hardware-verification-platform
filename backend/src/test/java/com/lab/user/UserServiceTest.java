package com.lab.user;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @InjectMocks
    private UserService userService;

    @BeforeEach
    void setUp() {
        // lenient because not all tests use this
        lenient().when(passwordEncoder.encode(anyString())).thenReturn("encoded-password");
    }

    @Test
    @DisplayName("注册 - 正常注册成功")
    void register_success() {
        when(userRepository.existsByEmail("new@test.com")).thenReturn(false);
        when(userRepository.findByUsername("newuser")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setId(1L);
            return u;
        });

        User result = userService.register("new@test.com", "Password123", "newuser");

        assertNotNull(result);
        assertEquals("new@test.com", result.getEmail());
        assertEquals("newuser", result.getUsername());
        assertEquals("engineer", result.getRole());
        assertEquals(User.Status.ACTIVE, result.getStatus());
        assertEquals("encoded-password", result.getPassword());
        assertFalse(result.getEmailVerified());
        verify(userRepository).save(any(User.class));
    }

    @Test
    @DisplayName("注册 - 重复邮箱抛异常")
    void register_duplicateEmail_throwsException() {
        when(userRepository.existsByEmail("existing@test.com")).thenReturn(true);

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> userService.register("existing@test.com", "password", "user"));
        assertTrue(ex.getMessage().contains("该邮箱已注册"));
    }

    @Test
    @DisplayName("注册 - 重复用户名抛异常")
    void register_duplicateUsername_throwsException() {
        when(userRepository.existsByEmail("new@test.com")).thenReturn(false);
        when(userRepository.findByUsername("existinguser")).thenReturn(Optional.of(new User()));

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> userService.register("new@test.com", "password", "existinguser"));
        assertTrue(ex.getMessage().contains("用户名已被使用"));
    }

    @Test
    @DisplayName("认证 - 正确密码")
    void authenticate_success() {
        User user = new User();
        user.setId(1L);
        user.setEmail("test@test.com");
        user.setPassword("encoded-password");
        when(userRepository.findByEmail("test@test.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password123", "encoded-password")).thenReturn(true);

        User result = userService.authenticate("test@test.com", "password123");

        assertNotNull(result);
        assertEquals(1L, result.getId());
    }

    @Test
    @DisplayName("认证 - 错误密码抛异常")
    void authenticate_wrongPassword_throwsException() {
        User user = new User();
        user.setPassword("encoded-password");
        when(userRepository.findByEmail("test@test.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong", "encoded-password")).thenReturn(false);

        assertThrows(RuntimeException.class,
                () -> userService.authenticate("test@test.com", "wrong"));
    }

    @Test
    @DisplayName("认证 - 邮箱不存在抛异常")
    void authenticate_emailNotFound_throwsException() {
        when(userRepository.findByEmail("notexist@test.com")).thenReturn(Optional.empty());

        assertThrows(RuntimeException.class,
                () -> userService.authenticate("notexist@test.com", "password"));
    }

    @Test
    @DisplayName("findById - 存在")
    void findById_exists() {
        User user = new User();
        user.setId(1L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));

        assertTrue(userService.findById(1L).isPresent());
    }

    @Test
    @DisplayName("findById - 不存在")
    void findById_notFound() {
        when(userRepository.findById(999L)).thenReturn(Optional.empty());

        assertFalse(userService.findById(999L).isPresent());
    }

    @Test
    @DisplayName("findByEmail - 存在")
    void findByEmail_exists() {
        when(userRepository.findByEmail("test@test.com")).thenReturn(Optional.of(new User()));

        assertTrue(userService.findByEmail("test@test.com").isPresent());
    }
}
