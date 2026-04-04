package com.lab.alert;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

/**
 * 告警服务 — 含预置告警规则检测
 * @feat #176
 */
@Service
public class AlertService {

    private final AlertRepository repo;
    private final ComputeNodeRepository nodeRepo;
    private final ObjectMapper objectMapper;

    public AlertService(AlertRepository repo, ComputeNodeRepository nodeRepo, ObjectMapper objectMapper) {
        this.repo = repo;
        this.nodeRepo = nodeRepo;
        this.objectMapper = objectMapper;
    }

    public List<Alert> list(Long nodeId, String status, String level) {
        List<Alert> alerts;
        if (nodeId != null && status != null) {
            try {
                alerts = repo.findByNodeIdAndStatusOrderByCreatedAtDesc(nodeId, Alert.Status.valueOf(status.toUpperCase()));
            } catch (IllegalArgumentException e) {
                alerts = repo.findByNodeId(nodeId);
            }
        } else if (nodeId != null) {
            alerts = repo.findByNodeId(nodeId);
        } else if (status != null) {
            try {
                alerts = repo.findByStatus(Alert.Status.valueOf(status.toUpperCase()));
            } catch (IllegalArgumentException e) {
                alerts = repo.findAllByOrderByCreatedAtDesc();
            }
        } else {
            alerts = repo.findAllByOrderByCreatedAtDesc();
        }

        // Filter by level
        if (level != null && !level.isBlank()) {
            try {
                Alert.Level lvl = Alert.Level.valueOf(level.toUpperCase());
                alerts = alerts.stream().filter(a -> a.getLevel() == lvl).toList();
            } catch (IllegalArgumentException ignored) {}
        }

        return alerts;
    }

    @Transactional
    public Alert acknowledge(Long id) {
        Alert alert = repo.findById(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "告警不存在: " + id));
        alert.setStatus(Alert.Status.ACKNOWLEDGED);
        alert.setAcknowledgedAt(Instant.now());
        return repo.save(alert);
    }

    /**
     * 预置告警规则 — 每60秒检测一次
     * 规则：节点离线 / GPU温度>85℃ / 磁盘>90%
     */
    @Scheduled(fixedRate = 60000)
    @Transactional
    public void checkAlertRules() {
        List<ComputeNode> allNodes = nodeRepo.findAll();

        for (ComputeNode node : allNodes) {
            // 规则1: 节点离线超过5分钟
            if (node.getStatus() == ComputeNode.Status.OFFLINE && node.getLastHeartbeat() != null) {
                if (node.getLastHeartbeat().isBefore(Instant.now().minus(5, ChronoUnit.MINUTES))) {
                    createAlertIfNotExists(node, "node_offline", Alert.Level.CRITICAL,
                        "节点 " + node.getName() + " 已离线超过5分钟");
                }
            }

            // Parse hardware info for more rules
            if (node.getHardwareInfo() == null) continue;
            Map<String, Object> hw;
            try {
                hw = objectMapper.readValue(node.getHardwareInfo(), Map.class);
            } catch (Exception e) {
                continue;
            }

            // 规则2: GPU温度 > 85℃
            Object gpuTemp = hw.get("gpuTemperature");
            if (gpuTemp != null) {
                double temp = ((Number) gpuTemp).doubleValue();
                if (temp > 85) {
                    createAlertIfNotExists(node, "gpu_overheat", Alert.Level.CRITICAL,
                        "节点 " + node.getName() + " GPU温度过高: " + temp + "℃ (阈值: 85℃)");
                }
            }

            // 规则3: 磁盘使用率 > 90%
            Object diskUsage = hw.get("diskUsage");
            if (diskUsage != null) {
                double usage = ((Number) diskUsage).doubleValue();
                if (usage > 90) {
                    createAlertIfNotExists(node, "disk_full", Alert.Level.WARNING,
                        "节点 " + node.getName() + " 磁盘使用率过高: " + String.format("%.1f", usage) + "% (阈值: 90%)");
                }
            }
        }
    }

    private void createAlertIfNotExists(ComputeNode node, String ruleName, Alert.Level level, String message) {
        // Avoid duplicates: check if active alert for same node + rule already exists
        List<Alert> existing = repo.findByNodeIdAndStatusOrderByCreatedAtDesc(node.getId(), Alert.Status.ACTIVE);
        boolean hasDuplicate = existing.stream().anyMatch(a -> ruleName.equals(a.getRuleName()));
        if (!hasDuplicate) {
            Alert alert = new Alert();
            alert.setNodeId(node.getId());
            alert.setNodeName(node.getName());
            alert.setRuleName(ruleName);
            alert.setLevel(level);
            alert.setMessage(message);
            alert.setStatus(Alert.Status.ACTIVE);
            repo.save(alert);
        }
    }
}
