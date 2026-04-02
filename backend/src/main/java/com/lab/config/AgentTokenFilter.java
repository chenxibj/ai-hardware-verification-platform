package com.lab.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Filter that authenticates requests bearing a static agent token.
 * Used by automated agents / CI pipelines to call protected endpoints
 * without a user JWT.
 */
@Component
public class AgentTokenFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(AgentTokenFilter.class);

    @Value("${agent.token:}")
    private String agentToken;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            String header = request.getHeader("X-Agent-Token");
            if (StringUtils.hasText(header) && StringUtils.hasText(agentToken) && agentToken.equals(header)) {
                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        "agent", null, AuthorityUtils.createAuthorityList("ROLE_AGENT"));
                SecurityContextHolder.getContext().setAuthentication(auth);
                log.debug("Agent token authenticated");
            }
        }
        filterChain.doFilter(request, response);
    }
}
