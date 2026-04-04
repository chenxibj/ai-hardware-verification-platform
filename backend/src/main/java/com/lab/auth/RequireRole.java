package com.lab.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标注在 Controller 方法/类上，声明需要的最低角色
 * 多个角色表示 OR 关系（满足任一即可），
 * 但实际使用中推荐只写一个"最低角色"，利用层级自动向上包含。
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireRole {
    Role[] value();
}
