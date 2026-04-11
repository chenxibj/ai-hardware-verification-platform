package com.lab.k8s;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class K8sClusterService {

    private static final Logger log = LoggerFactory.getLogger(K8sClusterService.class);

    private final K8sClusterRepository clusterRepo;
    private final ComputeNodeRepository nodeRepo;

    public K8sClusterService(K8sClusterRepository clusterRepo, ComputeNodeRepository nodeRepo) {
        this.clusterRepo = clusterRepo;
        this.nodeRepo = nodeRepo;
    }

    /**
     * 集群列表
     */
    public List<K8sCluster> list() {
        return clusterRepo.findAll(Sort.by(Sort.Direction.DESC, "createdAt"));
    }

    /**
     * 集群详情
     */
    public K8sCluster getById(Long id) {
        return clusterRepo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "集群不存在: " + id));
    }

    /**
     * 注册集群
     */
    @Transactional
    public K8sCluster register(K8sClusterRequest request) {
        if (request.getName() == null || request.getName().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "集群名称不能为空");
        }
        if (request.getKubeconfig() == null || request.getKubeconfig().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "kubeconfig 不能为空");
        }

        clusterRepo.findByName(request.getName()).ifPresent(c -> {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "集群名称已存在: " + request.getName());
        });

        String apiServerUrl = extractApiServerUrl(request.getKubeconfig());

        K8sCluster cluster = new K8sCluster();
        cluster.setName(request.getName());
        cluster.setKubeconfig(request.getKubeconfig());
        cluster.setStatus(K8sCluster.STATUS_REGISTERING);
        cluster.setApiServerUrl(apiServerUrl);
        cluster.setNodeCount(0);
        cluster.setOnlineCount(0);

        K8sCluster saved = clusterRepo.save(cluster);

        // Start async deployment flow
        final Long savedId = saved.getId();
        CompletableFuture.runAsync(() -> deployCluster(savedId));

        return saved;
    }

    /**
     * 删除集群 — 级联清理
     */
    @Transactional
    public void delete(Long id) {
        K8sCluster cluster = getById(id);

        try {
            cleanupDaemonSet(cluster);
        } catch (Exception e) {
            log.warn("清理 DaemonSet 失败（集群可能已不可达）: {}", e.getMessage());
        }

        List<ComputeNode> associatedNodes = nodeRepo.findByClusterId(cluster.getId());
        for (ComputeNode node : associatedNodes) {
            nodeRepo.delete(node);
        }
        log.info("已清理集群 {} 关联的 {} 个节点", cluster.getName(), associatedNodes.size());

        clusterRepo.delete(cluster);
    }

    /**
     * 获取集群部署状态
     */
    public Map<String, Object> getStatus(Long id) {
        K8sCluster cluster = getById(id);
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("id", cluster.getId());
        status.put("name", cluster.getName());
        status.put("status", cluster.getStatus());
        status.put("nodeCount", cluster.getNodeCount());
        status.put("onlineCount", cluster.getOnlineCount());
        status.put("apiServerUrl", cluster.getApiServerUrl());
        status.put("errorMessage", cluster.getErrorMessage());
        status.put("updatedAt", cluster.getUpdatedAt());

        int progress = switch (cluster.getStatus()) {
            case "REGISTERING" -> 10;
            case "DEPLOYING" -> 40;
            case "DISCOVERING" -> 70;
            case "READY" -> 100;
            case "ERROR" -> -1;
            default -> 0;
        };
        status.put("progress", progress);

        return status;
    }

    /**
     * 手动同步节点
     */
    @Transactional
    public Map<String, Object> syncNodes(Long id) {
        K8sCluster cluster = getById(id);
        Map<String, Object> result = new LinkedHashMap<>();

        try {
            List<Map<String, String>> k8sNodes = discoverK8sNodes(cluster);

            int added = 0;
            int updated = 0;

            for (Map<String, String> k8sNode : k8sNodes) {
                String nodeName = k8sNode.get("name");
                String nodeIp = k8sNode.get("ip");
                String fullName = cluster.getName() + "/" + nodeName;

                // Problem 5+6 fix: find by name OR by IP+clusterId to avoid duplicates
                Optional<ComputeNode> existing = nodeRepo.findByName(fullName);
                if (existing.isEmpty() && nodeIp != null) {
                    existing = nodeRepo.findByIpAddressAndClusterId(nodeIp, cluster.getId());
                }
                if (existing.isPresent()) {
                    ComputeNode node = existing.get();
                    if (nodeIp != null) node.setIpAddress(nodeIp);
                    node.setStatus(ComputeNode.Status.ONLINE);
                    node.setLastHeartbeat(Instant.now());
                    node.setClusterId(cluster.getId());
                    if (!"k8s-daemonset".equals(node.getSource())) {
                        node.setSource("k8s-discovery");
                    }
                    nodeRepo.save(node);
                    updated++;
                } else {
                    ComputeNode node = new ComputeNode();
                    node.setName(fullName);
                    node.setIpAddress(nodeIp);
                    node.setStatus(ComputeNode.Status.ONLINE);
                    node.setLastHeartbeat(Instant.now());
                    node.setClusterId(cluster.getId());
                    node.setSource("k8s-discovery");
                    node.setDescription("Auto-discovered from K8s cluster: " + cluster.getName());
                    nodeRepo.save(node);
                    added++;
                }
            }

            // 清理 K8s 中已不存在的节点
            List<ComputeNode> existingK8sNodes = nodeRepo.findByClusterId(cluster.getId());
            Set<String> currentK8sNodeKeys = new HashSet<>();
            for (Map<String, String> n : k8sNodes) {
                String ip = n.get("ip");
                String name = n.get("name");
                if (ip != null) currentK8sNodeKeys.add("ip:" + ip);
                if (name != null) currentK8sNodeKeys.add("name:" + cluster.getName() + "/" + name);
            }

            int removed = 0;
            for (ComputeNode existing : existingK8sNodes) {
                boolean stillExists = false;
                if (existing.getIpAddress() != null) {
                    stillExists = currentK8sNodeKeys.contains("ip:" + existing.getIpAddress());
                }
                if (!stillExists && existing.getName() != null) {
                    stillExists = currentK8sNodeKeys.contains("name:" + existing.getName());
                }
                if (!stillExists) {
                    log.info("Removing stale K8s node: {} (IP: {}) - no longer in cluster {}",
                            existing.getName(), existing.getIpAddress(), cluster.getName());
                    nodeRepo.delete(existing);
                    removed++;
                }
            }
            if (removed > 0) {
                log.info("Cleaned up {} stale nodes from cluster {}", removed, cluster.getName());
            }

            List<ComputeNode> clusterNodes = nodeRepo.findByClusterId(cluster.getId());
            cluster.setNodeCount(clusterNodes.size());
            cluster.setOnlineCount((int) clusterNodes.stream()
                    .filter(n -> n.getStatus() == ComputeNode.Status.ONLINE)
                    .count());
            cluster.setStatus(K8sCluster.STATUS_READY);
            cluster.setErrorMessage(null);
            clusterRepo.save(cluster);

            result.put("success", true);
            result.put("totalNodes", k8sNodes.size());
            result.put("added", added);
            result.put("updated", updated);
            result.put("removed", removed);
            result.put("clusterNodeCount", cluster.getNodeCount());
        } catch (Exception e) {
            log.error("同步集群节点失败: {}", e.getMessage(), e);
            cluster.setErrorMessage("同步失败: " + e.getMessage());
            clusterRepo.save(cluster);
            result.put("success", false);
            result.put("error", e.getMessage());
        }

        return result;
    }

    // ==================== Async Deployment Flow ====================

    private void deployCluster(Long clusterId) {
        try {
            K8sCluster cluster = clusterRepo.findById(clusterId).orElse(null);
            if (cluster == null) return;

            log.info("集群 {} 开始部署流程（discovery-only模式，跳过DaemonSet）", cluster.getName());

            // Skip DaemonSet deployment — use k8s-discovery mode only (#347)
            // deployDaemonSet(cluster);

            updateStatus(clusterId, K8sCluster.STATUS_DISCOVERING, null);
            Thread.sleep(2000);

            syncNodes(clusterId);

            log.info("集群 {} 部署完成", cluster.getName());
        } catch (Exception e) {
            log.error("集群部署失败: {}", e.getMessage(), e);
            updateStatus(clusterId, K8sCluster.STATUS_ERROR, e.getMessage());
        }
    }

    private void deployDaemonSet(K8sCluster cluster) throws Exception {
        Path kubeconfigFile = writeKubeconfig(cluster);
        try {
            String daemonSetYaml = generateDaemonSetYaml(cluster);

            // Apply namespace + daemonset via stdin
            List<String> applyCmd = List.of("kubectl",
                    "--kubeconfig=" + kubeconfigFile.toString(),
                    "apply", "-f", "-");

            ProcessBuilder pb = new ProcessBuilder(applyCmd);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            try (OutputStream os = process.getOutputStream()) {
                os.write(daemonSetYaml.getBytes());
                os.flush();
            }

            StringBuilder output = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }
            }

            boolean finished = process.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new RuntimeException("kubectl apply 超时");
            }

            int exitCode = process.exitValue();
            log.info("kubectl apply 输出: {}", output.toString().trim());
            if (exitCode != 0 && !output.toString().contains("already exists")) {
                throw new RuntimeException("kubectl apply 失败: " + output.toString().trim());
            }

            log.info("DaemonSet 已部署到集群: {}", cluster.getName());
        } finally {
            Files.deleteIfExists(kubeconfigFile);
        }
    }

    private void cleanupDaemonSet(K8sCluster cluster) throws Exception {
        Path kubeconfigFile = writeKubeconfig(cluster);
        try {
            runKubectl(kubeconfigFile, "delete", "daemonset", "ahvp-agent",
                    "-n", "ahvp-system", "--ignore-not-found=true");
            runKubectl(kubeconfigFile, "delete", "namespace", "ahvp-system",
                    "--ignore-not-found=true");
            log.info("已清理集群 {} 上的 DaemonSet", cluster.getName());
        } finally {
            Files.deleteIfExists(kubeconfigFile);
        }
    }

    private List<Map<String, String>> discoverK8sNodes(K8sCluster cluster) throws Exception {
        Path kubeconfigFile = writeKubeconfig(cluster);
        try {
            String output = runKubectl(kubeconfigFile,
                    "get", "nodes", "-o",
                    "jsonpath={range .items[*]}{.metadata.name},{.status.addresses[?(@.type==\"InternalIP\")].address}{\"\\n\"}{end}");

            List<Map<String, String>> nodes = new ArrayList<>();
            if (output != null && !output.isBlank()) {
                for (String line : output.split("\n")) {
                    line = line.trim();
                    if (line.isEmpty()) continue;
                    String[] parts = line.split(",", 2);
                    Map<String, String> node = new HashMap<>();
                    node.put("name", parts[0]);
                    node.put("ip", parts.length > 1 ? parts[1] : null);
                    nodes.add(node);
                }
            }
            return nodes;
        } finally {
            Files.deleteIfExists(kubeconfigFile);
        }
    }

    // ==================== Helper Methods ====================

    private String extractApiServerUrl(String kubeconfig) {
        Pattern pattern = Pattern.compile("server:\\s*(https?://[^\\s]+)");
        Matcher matcher = pattern.matcher(kubeconfig);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return null;
    }

    private Path writeKubeconfig(K8sCluster cluster) throws IOException {
        Path tempFile = Files.createTempFile("kubeconfig-" + cluster.getId() + "-", ".yaml");
        Files.writeString(tempFile, cluster.getKubeconfig());
        return tempFile;
    }

    /**
     * 执行 kubectl 命令（无 stdin）
     */
    private String runKubectl(Path kubeconfigFile, String... args) throws Exception {
        List<String> command = new ArrayList<>();
        command.add("kubectl");
        command.add("--kubeconfig=" + kubeconfigFile.toString());
        command.addAll(Arrays.asList(args));

        log.debug("执行 kubectl: {}", String.join(" ", command));

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.redirectErrorStream(true);
        Process process = pb.start();

        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
        }

        boolean finished = process.waitFor(30, TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            throw new RuntimeException("kubectl 命令超时");
        }

        int exitCode = process.exitValue();
        if (exitCode != 0) {
            String errorOutput = output.toString().trim();
            if (errorOutput.contains("already exists") || errorOutput.contains("not found")) {
                log.debug("kubectl 命令非关键错误: {}", errorOutput);
                return errorOutput;
            }
            throw new RuntimeException("kubectl 命令失败 (exit " + exitCode + "): " + errorOutput);
        }

        return output.toString().trim();
    }

    private String generateDaemonSetYaml(K8sCluster cluster) {
        String platformUrl = System.getenv("PLATFORM_URL");
        if (platformUrl == null || platformUrl.isBlank()) {
            platformUrl = "http://ahvp-backend:8080";
        }

        return "apiVersion: v1\n" +
                "kind: Namespace\n" +
                "metadata:\n" +
                "  name: ahvp-system\n" +
                "---\n" +
                "apiVersion: apps/v1\n" +
                "kind: DaemonSet\n" +
                "metadata:\n" +
                "  name: ahvp-agent\n" +
                "  namespace: ahvp-system\n" +
                "  labels:\n" +
                "    app: ahvp-agent\n" +
                "    cluster: " + cluster.getName() + "\n" +
                "spec:\n" +
                "  selector:\n" +
                "    matchLabels:\n" +
                "      app: ahvp-agent\n" +
                "  template:\n" +
                "    metadata:\n" +
                "      labels:\n" +
                "        app: ahvp-agent\n" +
                "        cluster: " + cluster.getName() + "\n" +
                "    spec:\n" +
                "      hostNetwork: true\n" +
                "      hostPID: true\n" +
                "      tolerations:\n" +
                "      - operator: Exists\n" +
                "      containers:\n" +
                "      - name: ahvp-agent\n" +
                "        image: ahvp/agent:latest\n" +
                "        imagePullPolicy: IfNotPresent\n" +
                "        env:\n" +
                "        - name: PLATFORM_URL\n" +
                "          value: \"" + platformUrl + "\"\n" +
                "        - name: CLUSTER_NAME\n" +
                "          value: \"" + cluster.getName() + "\"\n" +
                "        - name: CLUSTER_ID\n" +
                "          value: \"" + cluster.getId() + "\"\n" +
                "        - name: NODE_NAME\n" +
                "          valueFrom:\n" +
                "            fieldRef:\n" +
                "              fieldPath: spec.nodeName\n" +
                "        resources:\n" +
                "          requests:\n" +
                "            cpu: 100m\n" +
                "            memory: 128Mi\n" +
                "          limits:\n" +
                "            cpu: 500m\n" +
                "            memory: 512Mi\n" +
                "        volumeMounts:\n" +
                "        - name: host-root\n" +
                "          mountPath: /host\n" +
                "          readOnly: true\n" +
                "      volumes:\n" +
                "      - name: host-root\n" +
                "        hostPath:\n" +
                "          path: /\n";
    }

    @Transactional
    public void updateStatus(Long clusterId, String status, String errorMessage) {
        clusterRepo.findById(clusterId).ifPresent(cluster -> {
            cluster.setStatus(status);
            cluster.setErrorMessage(errorMessage);
            clusterRepo.save(cluster);
        });
    }

    /**
     * 定时同步集群节点（包含发现新节点和清理已移除节点）
     */
    @Scheduled(fixedRate = 60000)
    public void syncClusterNodeCounts() {
        List<K8sCluster> clusters = clusterRepo.findByStatus(K8sCluster.STATUS_READY);
        for (K8sCluster cluster : clusters) {
            try {
                syncNodes(cluster.getId());
            } catch (Exception e) {
                log.warn("Failed to sync cluster {}: {}", cluster.getName(), e.getMessage());
            }
        }
    }
}
