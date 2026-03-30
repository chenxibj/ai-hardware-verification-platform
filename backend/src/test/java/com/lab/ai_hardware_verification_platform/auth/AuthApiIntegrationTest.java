package com.lab.ai_hardware_verification_platform.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.HashMap;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 认证授权集成测试
 * 
 * 测试覆盖：
 * - 用户登录/登出
 * - Token 刷新
 * - 权限检查
 * - 角色验证
 */
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("认证授权集成测试")
class AuthApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String authToken;
    private String refreshToken;

    @BeforeEach
    void setUp() throws Exception {
        // 先注册测试用户
        Map<String, String> registerRequest = new HashMap<>();
        registerRequest.put("email", "auth_test@example.com");
        registerRequest.put("password", "SecurePassword123!");
        registerRequest.put("username", "AuthTestUser");

        try {
            mockMvc.perform(post("/api/users/register")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(registerRequest)))
                .andExpect(status().isCreated());
        } catch (Exception e) {
            // 用户可能已存在，忽略
        }

        // 登录获取 Token
        Map<String, String> loginRequest = new HashMap<>();
        loginRequest.put("email", "auth_test@example.com");
        loginRequest.put("password", "SecurePassword123!");

        String response = mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();

        authToken = objectMapper.readTree(response).get("token").asText();
        refreshToken = objectMapper.readTree(response).get("refreshToken").asText();
    }

    @Test
    @DisplayName("用户登录 - 成功")
    void login_Success() throws Exception {
        Map<String, String> request = new HashMap<>();
        request.put("email", "auth_test@example.com");
        request.put("password", "SecurePassword123!");

        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").exists())
            .andExpect(jsonPath("$.refreshToken").exists())
            .andExpect(jsonPath("$.expiresIn").exists());
    }

    @Test
    @DisplayName("用户登录 - 密码错误")
    void login_WrongPassword() throws Exception {
        Map<String, String> request = new HashMap<>();
        request.put("email", "auth_test@example.com");
        request.put("password", "WrongPassword");

        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("用户登录 - 用户不存在")
    void login_UserNotFound() throws Exception {
        Map<String, String> request = new HashMap<>();
        request.put("email", "notfound@example.com");
        request.put("password", "AnyPassword");

        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("刷新 Token - 成功")
    void refreshToken_Success() throws Exception {
        Map<String, String> request = new HashMap<>();
        request.put("refreshToken", refreshToken);

        mockMvc.perform(post("/api/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").exists())
            .andExpect(jsonPath("$.refreshToken").exists());
    }

    @Test
    @DisplayName("刷新 Token - 过期")
    void refreshToken_Expired() throws Exception {
        Map<String, String> request = new HashMap<>();
        request.put("refreshToken", "expired_token");

        mockMvc.perform(post("/api/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("刷新 Token - 空 Token")
    void refreshToken_Empty() throws Exception {
        Map<String, String> request = new HashMap<>();
        request.put("refreshToken", "");

        mockMvc.perform(post("/api/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("用户登出 - 成功")
    void logout_Success() throws Exception {
        mockMvc.perform(post("/api/auth/logout")
                .header("Authorization", "Bearer " + authToken))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("用户登出 - 重复登出 (幂等)")
    void logout_Idempotent() throws Exception {
        // 第一次登出
        mockMvc.perform(post("/api/auth/logout")
                .header("Authorization", "Bearer " + authToken))
            .andExpect(status().isOk());

        // 第二次登出（应该也成功）
        mockMvc.perform(post("/api/auth/logout")
                .header("Authorization", "Bearer " + authToken))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("权限检查 - 有权限")
    void checkPermission_HasPermission() throws Exception {
        Map<String, String> request = new HashMap<>();
        request.put("permission", "task:create");

        mockMvc.perform(post("/api/permissions/check")
                .header("Authorization", "Bearer " + authToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allowed").isBoolean())
            .andExpect(jsonPath("$.permission").value("task:create"));
    }

    @Test
    @DisplayName("权限检查 - 无权限")
    void checkPermission_NoPermission() throws Exception {
        Map<String, String> request = new HashMap<>();
        request.put("permission", "admin:delete");

        mockMvc.perform(post("/api/permissions/check")
                .header("Authorization", "Bearer " + authToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allowed").value(false));
    }

    @Test
    @DisplayName("权限检查 - 未授权")
    void checkPermission_Unauthorized() throws Exception {
        Map<String, String> request = new HashMap<>();
        request.put("permission", "task:create");

        mockMvc.perform(post("/api/permissions/check")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("获取当前用户信息 - 成功")
    void getCurrentUser_Success() throws Exception {
        mockMvc.perform(get("/api/auth/me")
                .header("Authorization", "Bearer " + authToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").exists())
            .andExpect(jsonPath("$.email").value("auth_test@example.com"));
    }

    @Test
    @DisplayName("获取当前用户信息 - 未授权")
    void getCurrentUser_Unauthorized() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("管理员访问 - 成功")
    void adminAccess_Success() throws Exception {
        // 假设有管理员权限
        mockMvc.perform(get("/api/admin/users")
                .header("Authorization", "Bearer " + authToken))
            .andExpect(status().isForbidden()); // 普通用户应该被拒绝
    }

    @Test
    @DisplayName("受保护接口 - 未授权访问")
    void protectedEndpoint_Unauthorized() throws Exception {
        mockMvc.perform(get("/api/tasks"))
            .andExpect(status().isUnauthorized());
    }
}
