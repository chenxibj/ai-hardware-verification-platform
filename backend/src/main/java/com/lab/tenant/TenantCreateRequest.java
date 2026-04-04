package com.lab.tenant;

import lombok.Data;

/**
 * 创建租户请求
 * @feat #174
 */
@Data
public class TenantCreateRequest {
    private String name;
    private String code;
    private String description;
    private String adminEmail;
    private Integer maxChips;
    private Integer maxConcurrent;
    private Integer storageGb;
    private String validUntil;
}
