package com.lab.common;

import lombok.Getter;

/**
 * 统一错误码枚举
 */
@Getter
public enum ErrorCode {

    // 通用
    SUCCESS("0", "成功", 200),
    BAD_REQUEST("COMMON-001", "请求参数错误", 400),
    UNAUTHORIZED("COMMON-002", "未登录或Token过期", 401),
    FORBIDDEN("COMMON-003", "权限不足", 403),
    NOT_FOUND("COMMON-004", "资源不存在", 404),
    INTERNAL_ERROR("COMMON-005", "系统内部错误", 500),

    // 评测
    EVAL_TIMEOUT("EVAL-001", "任务执行超时", 408),
    EVAL_OOM("EVAL-002", "内存溢出", 500),
    EVAL_NODE_OFFLINE("EVAL-003", "节点离线", 503),
    EVAL_PLAN_NOT_FOUND("EVAL-004", "评测计划不存在", 404),

    // 芯片
    CHIP_DUPLICATE("CHIP-001", "芯片编号重复", 409),
    CHIP_NOT_FOUND("CHIP-002", "芯片不存在", 404),

    // 用户/认证
    AUTH_INVALID_CREDENTIALS("AUTH-001", "用户名或密码错误", 401),
    AUTH_TOKEN_EXPIRED("AUTH-002", "Token已过期", 401),
    AUTH_EMAIL_EXISTS("AUTH-003", "邮箱已注册", 409);

    private final String code;
    private final String message;
    private final int httpStatus;

    ErrorCode(String code, String message, int httpStatus) {
        this.code = code;
        this.message = message;
        this.httpStatus = httpStatus;
    }
}
