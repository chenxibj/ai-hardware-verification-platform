package com.lab.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

/**
 * 全局异常处理器
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e) {
        log.warn("Business exception: [{}] {}", e.getErrorCode(), e.getMessage());
        ApiResponse<Void> resp = ApiResponse.error(e.getErrorCode(), e.getMessage());
        return ResponseEntity.status(e.getHttpStatus()).body(resp);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException e) {
        String detail = e.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .collect(Collectors.joining("; "));
        log.warn("Validation error: {}", detail);
        ApiResponse<Void> resp = ApiResponse.error(
                ErrorCode.BAD_REQUEST.getCode(),
                detail.isEmpty() ? ErrorCode.BAD_REQUEST.getMessage() : detail);
        return ResponseEntity.badRequest().body(resp);
    }

    /**
     * #330: 缺少请求参数 → 400
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingParam(MissingServletRequestParameterException e) {
        log.warn("Missing parameter: {}", e.getMessage());
        ApiResponse<Void> resp = ApiResponse.error(
                ErrorCode.BAD_REQUEST.getCode(),
                "缺少必需参数: " + e.getParameterName());
        return ResponseEntity.badRequest().body(resp);
    }

    /**
     * #330: 参数类型不匹配 → 400（不暴露Java内部类名）
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        log.warn("Type mismatch: {}", e.getMessage());
        String msg = "参数类型错误: " + e.getName() + " 应为 " + simplifyTypeName(e.getRequiredType());
        ApiResponse<Void> resp = ApiResponse.error(ErrorCode.BAD_REQUEST.getCode(), msg);
        return ResponseEntity.badRequest().body(resp);
    }

    /**
     * #330/#337: 请求体不可读（空body/格式错误）→ 400
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotReadable(HttpMessageNotReadableException e) {
        log.warn("Message not readable: {}", e.getMessage());
        ApiResponse<Void> resp = ApiResponse.error(
                ErrorCode.BAD_REQUEST.getCode(),
                "请求体格式错误或为空");
        return ResponseEntity.badRequest().body(resp);
    }

    /**
     * #330/#338: IllegalArgumentException → 400（不暴露Java内部类名）
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArgument(IllegalArgumentException e) {
        log.warn("Illegal argument: {}", e.getMessage());
        String msg = e.getMessage();
        if (msg != null && msg.contains("No enum constant")) {
            msg = "无效的参数值";
        }
        ApiResponse<Void> resp = ApiResponse.error(ErrorCode.BAD_REQUEST.getCode(), msg);
        return ResponseEntity.badRequest().body(resp);
    }

    /**
     * #340: 数据完整性异常（如字段过长）→ 400 友好提示
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleDataIntegrity(DataIntegrityViolationException e) {
        log.warn("Data integrity violation: {}", e.getMessage());
        String msg = "数据校验失败";
        String detail = e.getMostSpecificCause().getMessage();
        if (detail != null && detail.contains("value too long")) {
            msg = "输入内容超出长度限制";
        } else if (detail != null && detail.contains("duplicate key")) {
            msg = "数据已存在，请勿重复创建";
        } else if (detail != null && detail.contains("not-null")) {
            msg = "缺少必填字段";
        }
        ApiResponse<Void> resp = ApiResponse.error(ErrorCode.BAD_REQUEST.getCode(), msg);
        return ResponseEntity.badRequest().body(resp);
    }

    /**
     * 静态资源未找到 → 404
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResource(NoResourceFoundException e) {
        log.warn("Resource not found: {}", e.getMessage());
        ApiResponse<Void> resp = ApiResponse.error(ErrorCode.NOT_FOUND.getCode(), "请求的资源不存在");
        return ResponseEntity.status(404).body(resp);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneral(Exception e) {
        log.error("Unhandled exception", e);
        ApiResponse<Void> resp = ApiResponse.error(ErrorCode.INTERNAL_ERROR);
        return ResponseEntity.internalServerError().body(resp);
    }

    private String simplifyTypeName(Class<?> type) {
        if (type == null) return "未知";
        return switch (type.getSimpleName()) {
            case "Long" -> "数字(Long)";
            case "Integer", "int" -> "数字(Integer)";
            case "String" -> "字符串";
            case "Boolean", "boolean" -> "布尔值";
            default -> type.getSimpleName();
        };
    }
}
