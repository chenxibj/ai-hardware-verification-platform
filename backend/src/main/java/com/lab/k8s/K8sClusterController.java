package com.lab.k8s;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/k8s/clusters")
public class K8sClusterController {

    private final K8sClusterService service;

    public K8sClusterController(K8sClusterService service) {
        this.service = service;
    }

    /**
     * POST /api/k8s/clusters — 注册集群
     */
    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Map<String, Object>> register(@RequestBody K8sClusterRequest request) {
        K8sCluster cluster = service.register(request);
        return ApiResponse.ok(toSummary(cluster));
    }

    /**
     * GET /api/k8s/clusters — 集群列表（不返回 kubeconfig）
     */
    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list() {
        List<Map<String, Object>> result = service.list().stream()
                .map(this::toSummary)
                .collect(Collectors.toList());
        return ApiResponse.ok(result);
    }

    /**
     * GET /api/k8s/clusters/{id} — 集群详情（不返回完整 kubeconfig）
     */
    @GetMapping("/{id}")
    public ApiResponse<Map<String, Object>> getById(@PathVariable Long id) {
        K8sCluster cluster = service.getById(id);
        Map<String, Object> detail = toSummary(cluster);
        // Add masked kubeconfig hint
        detail.put("kubeconfigConfigured", cluster.getKubeconfig() != null && !cluster.getKubeconfig().isBlank());
        return ApiResponse.ok(detail);
    }

    /**
     * DELETE /api/k8s/clusters/{id} — 删除集群
     */
    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok();
    }

    /**
     * GET /api/k8s/clusters/{id}/status — 部署进度
     */
    @GetMapping("/{id}/status")
    public ApiResponse<Map<String, Object>> getStatus(@PathVariable Long id) {
        return ApiResponse.ok(service.getStatus(id));
    }

    /**
     * POST /api/k8s/clusters/{id}/sync — 手动同步节点
     */
    @PostMapping("/{id}/sync")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Map<String, Object>> syncNodes(@PathVariable Long id) {
        return ApiResponse.ok(service.syncNodes(id));
    }

    /**
     * 集群摘要（不含敏感信息）
     */
    private Map<String, Object> toSummary(K8sCluster cluster) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", cluster.getId());
        map.put("name", cluster.getName());
        map.put("status", cluster.getStatus());
        map.put("nodeCount", cluster.getNodeCount());
        map.put("onlineCount", cluster.getOnlineCount());
        map.put("apiServerUrl", cluster.getApiServerUrl());
        map.put("errorMessage", cluster.getErrorMessage());
        map.put("createdAt", cluster.getCreatedAt());
        map.put("updatedAt", cluster.getUpdatedAt());
        return map;
    }
}
