package com.lab.resource;

import lombok.Data;
import java.util.List;

/**
 * 资源池请求
 * @feat #175
 */
@Data
public class ResourcePoolRequest {
    private String name;
    private String description;
    private String strategy;  // round_robin / least_loaded / priority / affinity
    private List<Long> nodeIds;
    private Long tenantBinding;
    private String status;
}
