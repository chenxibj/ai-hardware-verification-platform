package com.lab.auth;

/**
 * RBAC 角色枚举
 * 权限层级: SUPER_ADMIN > TENANT_ADMIN > ENGINEER > PRODUCT_MGR > VIEWER
 */
public enum Role {
    SUPER_ADMIN(0),    // 超级管理员
    TENANT_ADMIN(1),   // 租户管理员
    ENGINEER(2),       // 评测工程师
    PRODUCT_MGR(3),    // 产品经理
    VIEWER(4);         // 只读用户

    private final int level;

    Role(int level) {
        this.level = level;
    }

    public int getLevel() {
        return level;
    }

    /**
     * 判断当前角色是否 >= 所需角色（数值越小权限越高）
     */
    public boolean hasPermission(Role required) {
        return this.level <= required.level;
    }

    /**
     * 安全解析：无法识别时返回 null
     */
    public static Role fromString(String str) {
        if (str == null) return null;
        try {
            return Role.valueOf(str.toUpperCase());
        } catch (IllegalArgumentException e) {
            // 兼容旧数据: ADMIN -> SUPER_ADMIN, USER -> ENGINEER
            return switch (str.toUpperCase()) {
                case "ADMIN" -> SUPER_ADMIN;
                case "USER"  -> ENGINEER;
                default      -> null;
            };
        }
    }
}
