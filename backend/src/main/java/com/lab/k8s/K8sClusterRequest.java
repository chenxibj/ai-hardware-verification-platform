package com.lab.k8s;

import lombok.Data;

/**
 * 集群注册请求
 */
@Data
public class K8sClusterRequest {
    private String name;
    private String kubeconfig;
}
