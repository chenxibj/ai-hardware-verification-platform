package com.lab.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.IOException;
import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * #496: AgentTokenFilter 测试 — 验证 Agent 端点的 Token 认证拦截
 */
@ExtendWith(MockitoExtension.class)
class AgentTokenFilterTest {

    private AgentTokenFilter filter;

    @Mock
    private FilterChain filterChain;

    private static final String VALID_TOKEN = "ahvp-agent-secret-2026";

    @BeforeEach
    void setUp() throws Exception {
        filter = new AgentTokenFilter();
        // Use reflection to set the agentToken field
        Field tokenField = AgentTokenFilter.class.getDeclaredField("agentToken");
        tokenField.setAccessible(true);
        tokenField.set(filter, VALID_TOKEN);
        SecurityContextHolder.clearContext();
    }

    // --- Agent endpoints that MUST require token ---

    @Test
    @DisplayName("#496: heartbeat without token -> 401")
    void heartbeat_noToken_returns401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/nodes/1/heartbeat");
        request.setServletPath("/api/nodes/1/heartbeat");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(401, response.getStatus());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: heartbeat with wrong token -> 401")
    void heartbeat_wrongToken_returns401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/nodes/1/heartbeat");
        request.setServletPath("/api/nodes/1/heartbeat");
        request.addHeader("X-Agent-Token", "wrong-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(401, response.getStatus());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: heartbeat with correct token -> passes through")
    void heartbeat_validToken_passesThrough() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/nodes/1/heartbeat");
        request.setServletPath("/api/nodes/1/heartbeat");
        request.addHeader("X-Agent-Token", VALID_TOKEN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(200, response.getStatus());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: poll-tasks without token -> 401")
    void pollTasks_noToken_returns401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/nodes/5/poll-tasks");
        request.setServletPath("/api/nodes/5/poll-tasks");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(401, response.getStatus());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: register without token -> 401")
    void register_noToken_returns401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/nodes/register");
        request.setServletPath("/api/nodes/register");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(401, response.getStatus());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: task result without token -> 401")
    void taskResult_noToken_returns401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tasks/10/result");
        request.setServletPath("/api/tasks/10/result");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(401, response.getStatus());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: task failure without token -> 401")
    void taskFailure_noToken_returns401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tasks/10/failure");
        request.setServletPath("/api/tasks/10/failure");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(401, response.getStatus());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: task progress without token -> 401")
    void taskProgress_noToken_returns401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tasks/10/progress");
        request.setServletPath("/api/tasks/10/progress");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(401, response.getStatus());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: task logs batch without token -> 401")
    void taskLogsBatch_noToken_returns401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tasks/10/logs/batch");
        request.setServletPath("/api/tasks/10/logs/batch");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(401, response.getStatus());
        verify(filterChain, never()).doFilter(request, response);
    }

    // --- Non-agent endpoints should NOT be blocked ---

    @Test
    @DisplayName("#496: non-agent endpoint (/api/tasks) without token -> passes through")
    void nonAgentEndpoint_noToken_passesThrough() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tasks");
        request.setServletPath("/api/tasks");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(200, response.getStatus());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: auth endpoint without token -> passes through")
    void authEndpoint_noToken_passesThrough() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.setServletPath("/api/auth/login");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(200, response.getStatus());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: GET /api/nodes (list) without agent token -> passes through (JWT protected, not agent)")
    void nodesList_noToken_passesThrough() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/nodes");
        request.setServletPath("/api/nodes");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(200, response.getStatus());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: task result with valid token -> passes through")
    void taskResult_validToken_passesThrough() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tasks/10/result");
        request.setServletPath("/api/tasks/10/result");
        request.addHeader("X-Agent-Token", VALID_TOKEN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(200, response.getStatus());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: heartbeat without /api prefix (servletPath stripped) -> 401")
    void heartbeat_noApiPrefix_noToken_returns401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/nodes/1/heartbeat");
        request.setServletPath("/nodes/1/heartbeat");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(401, response.getStatus());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("#496: heartbeat without /api prefix + valid token -> passes")
    void heartbeat_noApiPrefix_validToken_passesThrough() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/nodes/1/heartbeat");
        request.setServletPath("/nodes/1/heartbeat");
        request.addHeader("X-Agent-Token", VALID_TOKEN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertEquals(200, response.getStatus());
        verify(filterChain).doFilter(request, response);
    }

}
