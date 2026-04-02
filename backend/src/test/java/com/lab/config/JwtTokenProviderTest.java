package com.lab.config;

import io.jsonwebtoken.ExpiredJwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JwtTokenProviderTest {

    private JwtTokenProvider jwtTokenProvider;

    @BeforeEach
    void setUp() {
        // secret 至少 32 bytes for HS256
        String secret = "test-secret-key-for-unit-tests-must-be-at-least-32-bytes-long";
        jwtTokenProvider = new JwtTokenProvider(secret, 86400000L); // 1 day
    }

    @Test
    @DisplayName("生成 token - 不为空")
    void generateToken_shouldReturnNonNull() {
        String token = jwtTokenProvider.generateToken(1L, "test@test.com", "USER");
        assertNotNull(token);
        assertFalse(token.isEmpty());
    }

    @Test
    @DisplayName("从 token 解析 userId")
    void getUserIdFromToken_shouldReturnCorrectUserId() {
        String token = jwtTokenProvider.generateToken(42L, "user@test.com", "USER");
        Long userId = jwtTokenProvider.getUserIdFromToken(token);
        assertEquals(42L, userId);
    }

    @Test
    @DisplayName("验证有效 token")
    void validateToken_validToken_returnsTrue() {
        String token = jwtTokenProvider.generateToken(1L, "test@test.com", "USER");
        assertTrue(jwtTokenProvider.validateToken(token));
    }

    @Test
    @DisplayName("验证无效 token")
    void validateToken_invalidToken_returnsFalse() {
        assertFalse(jwtTokenProvider.validateToken("invalid.token.here"));
    }

    @Test
    @DisplayName("验证空 token")
    void validateToken_emptyToken_returnsFalse() {
        assertFalse(jwtTokenProvider.validateToken(""));
    }

    @Test
    @DisplayName("过期 token 抛出 ExpiredJwtException")
    void validateToken_expiredToken_throwsExpiredException() {
        // 创建一个过期时间为 1ms 的 provider
        JwtTokenProvider shortLivedProvider = new JwtTokenProvider(
                "test-secret-key-for-unit-tests-must-be-at-least-32-bytes-long", 1L);
        String token = shortLivedProvider.generateToken(1L, "test@test.com", "USER");

        // 等待 token 过期
        try { Thread.sleep(50); } catch (InterruptedException e) { }

        assertThrows(ExpiredJwtException.class, () -> shortLivedProvider.validateToken(token));
    }

    @Test
    @DisplayName("生成 refresh token")
    void generateRefreshToken_shouldReturnNonNull() {
        String token = jwtTokenProvider.generateRefreshToken(1L);
        assertNotNull(token);
        assertFalse(token.isEmpty());
    }

    @Test
    @DisplayName("refresh token 可以解析 userId")
    void refreshToken_shouldContainUserId() {
        String token = jwtTokenProvider.generateRefreshToken(99L);
        Long userId = jwtTokenProvider.getUserIdFromToken(token);
        assertEquals(99L, userId);
    }
}
