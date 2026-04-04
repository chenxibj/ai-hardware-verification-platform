package com.lab.auth;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * RBAC 权限拦截器
 * 从 SecurityContext 中取出已认证的 User，检查 @RequireRole 注解
 */
@Slf4j
@Component
public class RoleInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 只拦截 Controller 方法
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return true;
        }

        // 方法级注解优先，否则看类级
        RequireRole annotation = handlerMethod.getMethodAnnotation(RequireRole.class);
        if (annotation == null) {
            annotation = handlerMethod.getBeanType().getAnnotation(RequireRole.class);
        }

        // 没有 @RequireRole 注解 → 不做角色检查（仅需 authenticated，由 Spring Security 保证）
        if (annotation == null) {
            return true;
        }

        // 取出当前用户
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }

        Object principal = auth.getPrincipal();

        // Agent token 认证的请求，principal 是 "agent" 字符串，放行所有 @RequireRole 检查
        if (principal instanceof String && "agent".equals(principal)) {
            return true;
        }

        if (!(principal instanceof User user)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }

        // 解析用户角色
        Role userRole = Role.fromString(user.getRole());
        if (userRole == null) {
            log.warn("User {} has unrecognized role: {}", user.getId(), user.getRole());
            throw new BusinessException(ErrorCode.FORBIDDEN, "角色无法识别: " + user.getRole());
        }

        // 检查权限: 用户角色 >= 注解中任一所需角色即可
        Role[] requiredRoles = annotation.value();
        for (Role required : requiredRoles) {
            if (userRole.hasPermission(required)) {
                return true;
            }
        }

        log.warn("Access denied: user={} role={} required={}", user.getEmail(), userRole, requiredRoles);
        throw new BusinessException(ErrorCode.FORBIDDEN,
                "权限不足，需要角色: " + java.util.Arrays.toString(requiredRoles) + "，当前角色: " + userRole);
    }
}
