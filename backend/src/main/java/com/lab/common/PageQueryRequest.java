package com.lab.common;

import lombok.Data;

/**
 * 统一分页查询请求
 * 注意：命名为 PageQueryRequest 以避免与 Spring 的 PageRequest 冲突
 */
@Data
public class PageQueryRequest {

    private int page = 1;
    private int pageSize = 20;
    private String sort;
    private String order = "asc";    // asc | desc

    /**
     * 转为 Spring Pageable (0-based)
     */
    public org.springframework.data.domain.PageRequest toPageable() {
        int p = Math.max(0, page - 1);  // 外部1-based -> 内部0-based
        int s = Math.max(1, Math.min(pageSize, 500));
        if (sort != null && !sort.isBlank()) {
            org.springframework.data.domain.Sort.Direction dir =
                    "desc".equalsIgnoreCase(order)
                            ? org.springframework.data.domain.Sort.Direction.DESC
                            : org.springframework.data.domain.Sort.Direction.ASC;
            return org.springframework.data.domain.PageRequest.of(p, s,
                    org.springframework.data.domain.Sort.by(dir, sort));
        }
        return org.springframework.data.domain.PageRequest.of(p, s);
    }
}
