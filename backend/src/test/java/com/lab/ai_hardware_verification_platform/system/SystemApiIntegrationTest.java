package com.lab.ai_hardware_verification_platform.system;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 系统接口集成测试
 * 
 * 测试覆盖：
 * - 健康检查接口
 * - Actuator 端点
 * - 系统信息接口
 */
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("系统接口集成测试")
class SystemApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("健康检查 - 成功")
    void healthCheck_Success() throws Exception {
        mockMvc.perform(get("/api/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"))
            .andExpect(jsonPath("$.components").exists());
    }

    @Test
    @DisplayName("数据库健康检查 - 成功")
    void healthCheckDb_Success() throws Exception {
        mockMvc.perform(get("/api/health/db"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    @DisplayName("Ping 检查 - 成功")
    void healthCheckPing_Success() throws Exception {
        mockMvc.perform(get("/api/health/ping"))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("应用信息 - 成功")
    void actuatorInfo_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/info"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.build").exists());
    }

    @Test
    @DisplayName("性能指标 - 成功")
    void actuatorMetrics_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/metrics"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.metrics").exists());
    }

    @Test
    @DisplayName("JVM 内存指标 - 成功")
    void actuatorMetricsJvm_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/metrics/jvm.memory.used"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.measurements").exists());
    }

    @Test
    @DisplayName("线程指标 - 成功")
    void actuatorMetricsThreads_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/metrics/jvm.threads.live"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.measurements").exists());
    }

    @Test
    @DisplayName("HTTP 请求指标 - 成功")
    void actuatorMetricsHttp_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/metrics/http.server.requests"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.measurements").exists());
    }

    @Test
    @DisplayName("日志端点 - 成功")
    void actuatorLoggers_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/loggers"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.levels").exists());
    }

    @Test
    @DisplayName("配置端点 - 成功")
    void actuatorConfigProps_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/configprops"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.contexts").exists());
    }

    @Test
    @DisplayName("线程转储 - 成功")
    void actuatorThreaddump_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/threaddump"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.threads").exists());
    }

    @Test
    @DisplayName("环境变量 - 成功")
    void actuatorEnv_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/env"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.activeProfiles").exists());
    }

    @Test
    @DisplayName("Bean 信息 - 成功")
    void actuatorBeans_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/beans"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.contexts").exists());
    }

    @Test
    @DisplayName("HTTP 追踪 - 成功")
    void actuatorHttpexchanges_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/httpexchanges"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.exchanges").exists());
    }

    @Test
    @DisplayName("启动信息 - 成功")
    void actuatorStartup_Success() throws Exception {
        mockMvc.perform(get("/api/actuator/startup"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.springApplicationStartup").exists());
    }
}
