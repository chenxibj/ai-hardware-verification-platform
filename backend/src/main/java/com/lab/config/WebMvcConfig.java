package com.lab.config;

import com.lab.auth.RoleInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final RoleInterceptor roleInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(roleInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns(
                        "/auth/**",
                        "/actuator/**",
                        "/health/**",
                        "/error",
                        "/nodes/register",
                        "/nodes/*/heartbeat",
                        "/tasks/*/result",
                        "/tasks/*/failure",
                        "/tasks/*/complete"
                );
    }
}
