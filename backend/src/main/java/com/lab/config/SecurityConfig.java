package com.lab.config;

import jakarta.servlet.http.HttpServletResponse;
import java.util.Arrays;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig {
    private final JwtAuthenticationFilter jwtAuthFilter;
    private final AgentTokenFilter agentTokenFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthFilter, AgentTokenFilter agentTokenFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.agentTokenFilter = agentTokenFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(this.corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) -> {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.setCharacterEncoding("UTF-8");
                    response.getWriter().write("{\"code\":\"AUTH-002\",\"message\":\"未认证或Token已过期，请重新登录\"}");
                })
                .accessDeniedHandler((request, response, accessDeniedException) -> {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.setCharacterEncoding("UTF-8");
                    response.getWriter().write("{\"code\":\"AUTH-003\",\"message\":\"权限不足，您的角色无法执行此操作\"}");
                })
            )
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/ws/**").permitAll()  // #229 WebSocket
                .requestMatchers("/auth/**").permitAll()
                .requestMatchers("/health/**").permitAll()
                .requestMatchers("/actuator/**").permitAll()
                .requestMatchers("/error").permitAll()
                .requestMatchers("/dashboard/**").permitAll()
                .requestMatchers("/community/**").permitAll()
                .requestMatchers("/nodes/*/heartbeat").permitAll()
                .requestMatchers("/nodes/register").permitAll()
                .requestMatchers("/tasks/*/result").permitAll()
                .requestMatchers("/tasks/*/failure").permitAll()
                .requestMatchers("/tasks/*/logs").permitAll()  // #225
                .requestMatchers("/tasks/*/logs/stream").permitAll()  // #327 SSE
                .requestMatchers("/tasks/*/logs/batch").permitAll()  // #229
                .requestMatchers("/tasks/*/logs/stats").permitAll()  // #233
                .requestMatchers("/tasks/*/logs/metrics").permitAll()  // #233 P2-1
                .requestMatchers("/tasks/*/logs/download").permitAll()  // #233 P2-2
                .requestMatchers("/tasks/*/report").permitAll()  // #233 P2-3
                .requestMatchers("/tasks/*/complete").permitAll()
                .requestMatchers(HttpMethod.GET, "/templates", "/templates/**").permitAll()
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                // RBAC: 用户管理仅 super_admin
                .requestMatchers(HttpMethod.POST, "/users").hasRole("super_admin")
                .requestMatchers(HttpMethod.PUT, "/users/*/role").hasRole("super_admin")
                .requestMatchers(HttpMethod.PUT, "/users/*/status").hasRole("super_admin")
                .requestMatchers("/users/**").hasAnyRole("super_admin", "tenant_admin")
                // RBAC: 芯片注册/修改/删除需 engineer 以上
                .requestMatchers(HttpMethod.POST, "/chips").hasAnyRole("super_admin", "tenant_admin", "engineer")
                .requestMatchers(HttpMethod.PUT, "/chips/**").hasAnyRole("super_admin", "tenant_admin", "engineer")
                .requestMatchers(HttpMethod.DELETE, "/chips/**").hasAnyRole("super_admin", "tenant_admin", "engineer")
                // RBAC: 创建评测计划需 engineer 以上
                .requestMatchers(HttpMethod.POST, "/plans").hasAnyRole("super_admin", "tenant_admin", "engineer")
                // 其余需认证
                .anyRequest().authenticated()
            )
            .addFilterBefore(this.agentTokenFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(this.jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of("*"));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Authorization"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
