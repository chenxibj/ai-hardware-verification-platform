package com.lab.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

/**
 * 统一API响应体
 */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private int code;          // 业务码, 0=成功
    private String message;
    private T data;
    private long timestamp;

    public ApiResponse() {
        this.timestamp = System.currentTimeMillis();
    }

    public static <T> ApiResponse<T> ok(T data) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.setCode(0);
        resp.setMessage("success");
        resp.setData(data);
        return resp;
    }

    public static <T> ApiResponse<T> ok() {
        return ok(null);
    }

    public static <T> ApiResponse<T> error(ErrorCode errorCode) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.setCode(intFromCode(errorCode.getCode()));
        resp.setMessage(errorCode.getMessage());
        return resp;
    }

    public static <T> ApiResponse<T> error(String code, String message) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.setCode(intFromCode(code));
        resp.setMessage(message);
        return resp;
    }

    /**
     * 将错误码字符串转为int: "0"->0, "COMMON-001"->1001, "CHIP-002"->2002 等
     * 保持向后兼容: 前端以前用 code==0 判断成功
     */
    private static int intFromCode(String code) {
        if ("0".equals(code)) return 0;
        // 提取尾部数字作为int code, 加上前缀hash区分模块
        try {
            String[] parts = code.split("-");
            if (parts.length == 2) {
                int prefix = switch (parts[0]) {
                    case "COMMON" -> 1000;
                    case "EVAL" -> 2000;
                    case "CHIP" -> 3000;
                    case "AUTH" -> 4000;
                    default -> 9000;
                };
                return prefix + Integer.parseInt(parts[1]);
            }
        } catch (Exception ignored) {}
        return -1;
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.setCode(code);
        resp.setMessage(message);
        return resp;
    }
}
