package com.lab.tenant;

import lombok.Data;

/**
 * 更新租户请求
 * @feat #174
 */
@Data
public class TenantUpdateRequest {
    private String name;
    private String description;
    private String adminEmail;
    private String status;
    private Integer maxChips;
    private Integer maxConcurrent;
    private Integer storageGb;
    private String validUntil;
}
