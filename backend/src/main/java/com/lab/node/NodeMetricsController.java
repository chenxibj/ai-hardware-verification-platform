package com.lab.node;

import com.lab.common.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * 节点指标 Controller
 * @feat #176 资源监控与运维 (US-5.3)
 */
@RestController
@RequestMapping("/nodes")
public class NodeMetricsController {

    private final ComputeNodeService nodeService;
    private final ObjectMapper objectMapper;

    public NodeMetricsController(ComputeNodeService nodeService, ObjectMapper objectMapper) {
        this.nodeService = nodeService;
        this.objectMapper = objectMapper;
    }

    /**
     * GET /nodes/{id}/metrics — 返回CPU/GPU/内存/温度/功耗指标
     * 从硬件信息中解析当前快照（后续可扩展为时序数据）
     */
    @GetMapping("/{id}/metrics")
    public ApiResponse<Map<String, Object>> getMetrics(
            @PathVariable Long id,
            @RequestParam(required = false, defaultValue = "1") Integer hours) {
        ComputeNode node = nodeService.getById(id);

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("nodeId", node.getId());
        metrics.put("nodeName", node.getName());
        metrics.put("status", node.getStatus().name());
        metrics.put("timestamp", Instant.now().toString());

        // Parse hardware info
        if (node.getHardwareInfo() != null) {
            try {
                Map<String, Object> hw = objectMapper.readValue(node.getHardwareInfo(), Map.class);
                metrics.put("cpuUsage", hw.getOrDefault("cpuUsage", null));
                metrics.put("memoryUsage", hw.getOrDefault("memoryUsage", null));
                metrics.put("gpuUsage", hw.getOrDefault("gpuUsage", null));
                metrics.put("gpuTemperature", hw.getOrDefault("gpuTemperature", null));
                metrics.put("gpuPower", hw.getOrDefault("gpuPower", null));
                metrics.put("diskUsage", hw.getOrDefault("diskUsage", null));
                metrics.put("cpuTemperature", hw.getOrDefault("cpuTemperature", null));
                metrics.put("memoryTotal", hw.getOrDefault("memory_total_gb", null));
                metrics.put("diskTotal", hw.getOrDefault("disk_total_gb", null));
                metrics.put("diskFree", hw.getOrDefault("disk_free_gb", null));
            } catch (Exception e) {
                // ignore
            }
        }

        // Generate mock time-series for charts (from hardwareInfo snapshot)
        // In production, this would query a metrics_history table
        List<Map<String, Object>> history = generateMetricsHistory(metrics, hours);
        metrics.put("history", history);

        return ApiResponse.ok(metrics);
    }

    /**
     * 基于当前值生成历史数据点（带轻微波动），用于前端图表渲染
     */
    private List<Map<String, Object>> generateMetricsHistory(Map<String, Object> current, int hours) {
        List<Map<String, Object>> history = new ArrayList<>();
        int points = hours * 12; // 每5分钟一个点
        Instant now = Instant.now();
        Random rand = new Random(now.getEpochSecond());

        double baseCpu = toDouble(current.get("cpuUsage"), 30);
        double baseMem = toDouble(current.get("memoryUsage"), 50);
        double baseGpu = toDouble(current.get("gpuUsage"), 0);
        double baseTemp = toDouble(current.get("gpuTemperature"), 0);
        double baseDisk = toDouble(current.get("diskUsage"), 40);

        for (int i = points; i >= 0; i--) {
            Instant t = now.minusSeconds(i * 300L);
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("timestamp", t.toString());
            point.put("cpuUsage", clamp(baseCpu + (rand.nextGaussian() * 8), 0, 100));
            point.put("memoryUsage", clamp(baseMem + (rand.nextGaussian() * 3), 0, 100));
            if (baseGpu > 0) {
                point.put("gpuUsage", clamp(baseGpu + (rand.nextGaussian() * 10), 0, 100));
            }
            if (baseTemp > 0) {
                point.put("gpuTemperature", clamp(baseTemp + (rand.nextGaussian() * 3), 20, 100));
            }
            point.put("diskUsage", clamp(baseDisk + (rand.nextGaussian() * 0.5), 0, 100));
            history.add(point);
        }

        return history;
    }

    private double toDouble(Object val, double def) {
        if (val == null) return def;
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return def; }
    }

    private double clamp(double val, double min, double max) {
        return Math.round(Math.max(min, Math.min(max, val)) * 10.0) / 10.0;
    }
}
