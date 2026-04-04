package com.lab.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneral(Exception e) {
        log.error("Unhandled exception", e);
        ApiResponse<Void> resp = ApiResponse.error(ErrorCode.INTERNAL_ERROR);
        return ResponseEntity.internalServerError().body(resp);
    }
}
