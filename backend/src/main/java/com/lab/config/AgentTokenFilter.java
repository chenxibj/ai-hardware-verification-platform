package com.lab.config;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * #496: Filter that authenticates requests bearing a static agent token.
 * Agent endpoints (heartbeat, poll-tasks, register, task result/failure/progress/logs)
 * MUST provide a valid X-Agent-Token header, otherwise 401 is returned.
 * Non-agent endpoints pass through unaffected.
 */
@Component
public class AgentTokenFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(AgentTokenFilter.class);

    @Value("${agent.token:}")
    private String agentToken;


    @PostConstruct
    void validateAgentToken() {
        if (!StringUtils.hasText(agentToken)) {
            log.warn("============================================================");
            log.warn("  WARNING: AGENT_TOKEN is not configured!");
            log.warn("  Agent API endpoints will reject all requests.");
            log.warn("  Set the AGENT_TOKEN environment variable to enable agent communication.");
            log.warn("============================================================");
        }
    }

    /**
     * Patterns matching agent-only endpoints.
     * Context path (/api) is included because servletPath includes it.
     */
    private static final Pattern[] AGENT_ENDPOINT_PATTERNS = {
        Pattern.compile("^(/api)?/nodes/\\d+/heartbeat$"),
        Pattern.compile("^(/api)?/nodes/\\d+/poll-tasks$"),
        Pattern.compile("^(/api)?/nodes/register$"),
        Pattern.compile("^(/api)?/tasks/\\d+/result$"),
        Pattern.compile("^(/api)?/tasks/\\d+/failure$"),
        Pattern.compile("^(/api)?/tasks/\\d+/progress$"),
        Pattern.compile("^(/api)?/tasks/\\d+/complete$"),
        Pattern.compile("^(/api)?/tasks/\\d+/logs(/.*)?$"),
    };

    private boolean isAgentEndpoint(String path) {
        if (path == null) return false;
        for (Pattern pattern : AGENT_ENDPOINT_PATTERNS) {
            if (pattern.matcher(path).matches()) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // Use requestURI for reliable matching (servletPath strips context-path in some configs)
        String path = request.getRequestURI();
        String header = request.getHeader("X-Agent-Token");

        if (isAgentEndpoint(path)) {
            // Agent endpoint: token is REQUIRED
            if (!StringUtils.hasText(agentToken)) {
                // No agent token configured on server — reject all agent requests as misconfigured
                log.error("Agent token not configured on server, rejecting request to {}", path);
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setCharacterEncoding("UTF-8");
                response.getWriter().write("{\"code\":\"AGENT-001\",\"message\":\"Agent token not configured\"}");
                return;
            }
            if (!StringUtils.hasText(header) || !agentToken.equals(header)) {
                log.warn("Agent token validation failed for {} (token present: {})", path, StringUtils.hasText(header));
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setCharacterEncoding("UTF-8");
                response.getWriter().write("{\"code\":\"AGENT-002\",\"message\":\"Invalid or missing agent token\"}");
                return;
            }
            // Valid agent token — set security context
            if (SecurityContextHolder.getContext().getAuthentication() == null) {
                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        "agent", null, AuthorityUtils.createAuthorityList("ROLE_AGENT"));
                SecurityContextHolder.getContext().setAuthentication(auth);
                log.debug("Agent token authenticated for {}", path);
            }
        } else {
            // Non-agent endpoint: optionally set auth if token is present (backward compat)
            if (SecurityContextHolder.getContext().getAuthentication() == null
                    && StringUtils.hasText(header) && StringUtils.hasText(agentToken) && agentToken.equals(header)) {
                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        "agent", null, AuthorityUtils.createAuthorityList("ROLE_AGENT"));
                SecurityContextHolder.getContext().setAuthentication(auth);
                log.debug("Agent token authenticated (non-agent endpoint)");
            }
        }

        filterChain.doFilter(request, response);
    }
}
