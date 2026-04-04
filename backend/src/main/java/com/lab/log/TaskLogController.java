package com.lab.log;

import com.lab.common.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Random;

/**
 * 评测任务日志控制器
 * Issue: #173
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
public class TaskLogController {

    /**
     * 获取任务日志内容
     */
    @GetMapping("/{taskId}/logs")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTaskLogs(@PathVariable Long taskId) {
        String logContent = generateMockLog(taskId);
        Map<String, Object> data = Map.of(
                "taskId", taskId,
                "content", logContent,
                "lineCount", logContent.split("\n").length,
                "generatedAt", System.currentTimeMillis()
        );
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /**
     * 下载日志文件
     */
    @GetMapping("/{taskId}/logs/download")
    public ResponseEntity<Resource> downloadLogs(@PathVariable Long taskId) {
        String logContent = generateMockLog(taskId);
        ByteArrayResource resource = new ByteArrayResource(logContent.getBytes());
        String filename = "task-" + taskId + "-log.txt";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + filename)
                .contentType(MediaType.TEXT_PLAIN)
                .body(resource);
    }

    /**
     * 生成模拟评测日志
     */
    private String generateMockLog(Long taskId) {
        StringBuilder sb = new StringBuilder();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        LocalDateTime ts = LocalDateTime.now().minusMinutes(30);
        Random rng = new Random(taskId); // 固定种子让同一任务日志一致

        String taskNo = String.format("TASK-%03d", taskId);
        String[] models = {"ResNet-50", "BERT-Base", "GPT-2", "MobileNet-V3", "YOLOv8", "EfficientNet-B0"};
        String[] datasets = {"ImageNet-1K", "CIFAR-10", "COCO-2017", "SQuAD-v2", "MNIST", "WikiText-103"};
        String model = models[rng.nextInt(models.length)];
        String dataset = datasets[rng.nextInt(datasets.length)];

        appendLog(sb, fmt, ts, "INFO", "Starting evaluation task " + taskNo);
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Evaluation engine version: 2.4.1");
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Loading model: " + model);
        ts = ts.plusSeconds(2);
        appendLog(sb, fmt, ts, "INFO", "Model loaded successfully (" + (rng.nextInt(500) + 100) + "MB)");
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Loading dataset: " + dataset);
        ts = ts.plusSeconds(3);
        appendLog(sb, fmt, ts, "INFO", "Dataset loaded: " + (rng.nextInt(50000) + 1000) + " samples");
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Initializing evaluation environment...");
        ts = ts.plusSeconds(2);
        appendLog(sb, fmt, ts, "INFO", "Hardware: " + (rng.nextBoolean() ? "NVIDIA A100 40GB" : "Ascend 910B"));
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "CUDA version: 12.1 | Driver: 535.104.05");
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Warm-up phase: running 5 iterations...");

        for (int i = 1; i <= 5; i++) {
            ts = ts.plusSeconds(2);
            double latency = rng.nextDouble() * 15 + 2;
            appendLog(sb, fmt, ts, "INFO", String.format("  Warm-up iteration %d/5 — latency: %.2fms", i, latency));
        }

        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Warm-up complete. Starting benchmark...");
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Benchmark config: batch_size=32, iterations=100, precision=FP16");

        int totalIter = 100;
        for (int i = 10; i <= totalIter; i += 10) {
            ts = ts.plusSeconds(rng.nextInt(5) + 3);
            double latency = rng.nextDouble() * 5 + 3;
            double throughput = rng.nextDouble() * 500 + 200;
            appendLog(sb, fmt, ts, "INFO", String.format("  Progress: %d/%d — avg latency: %.2fms, throughput: %.1f ops/sec", i, totalIter, latency, throughput));

            // 偶尔加个 WARN
            if (rng.nextInt(10) < 2) {
                ts = ts.plusSeconds(1);
                String[] warnings = {
                        "GPU memory usage above 85%%",
                        "Batch processing time exceeded threshold",
                        "Detected thermal throttling on GPU 0",
                        "CPU utilization spike detected",
                };
                appendLog(sb, fmt, ts, "WARN", warnings[rng.nextInt(warnings.length)]);
            }
        }

        ts = ts.plusSeconds(2);
        appendLog(sb, fmt, ts, "INFO", "Benchmark complete. Computing metrics...");
        ts = ts.plusSeconds(1);

        double meanLatency = rng.nextDouble() * 8 + 2;
        double p50 = meanLatency * 0.9;
        double p95 = meanLatency * 1.5;
        double p99 = meanLatency * 2.1;
        double finalThroughput = rng.nextDouble() * 400 + 300;
        double cpuUtil = rng.nextDouble() * 40 + 40;
        double gpuUtil = rng.nextDouble() * 30 + 60;
        double score = rng.nextDouble() * 30 + 60;

        appendLog(sb, fmt, ts, "INFO", String.format("Metrics Summary:"));
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", String.format("  Mean Latency: %.2fms", meanLatency));
        appendLog(sb, fmt, ts, "INFO", String.format("  P50: %.2fms | P95: %.2fms | P99: %.2fms", p50, p95, p99));
        appendLog(sb, fmt, ts, "INFO", String.format("  Throughput: %.1f ops/sec", finalThroughput));
        appendLog(sb, fmt, ts, "INFO", String.format("  CPU Utilization: %.1f%% | GPU Utilization: %.1f%%", cpuUtil, gpuUtil));
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", String.format("  Final Score: %.1f/100", score));

        // 模拟少量错误场景
        if (taskId % 7 == 0) {
            ts = ts.plusSeconds(1);
            appendLog(sb, fmt, ts, "ERROR", "Memory allocation failed during result serialization");
            ts = ts.plusSeconds(1);
            appendLog(sb, fmt, ts, "ERROR", "java.lang.OutOfMemoryError: Java heap space");
            ts = ts.plusSeconds(1);
            appendLog(sb, fmt, ts, "WARN", "Retrying with reduced batch size...");
            ts = ts.plusSeconds(3);
            appendLog(sb, fmt, ts, "INFO", "Retry successful with batch_size=16");
        }

        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Saving evaluation results...");
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Results saved to database. Report generated.");
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Evaluation task " + taskNo + " completed successfully.");
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Cleaning up temporary files...");
        ts = ts.plusSeconds(1);
        appendLog(sb, fmt, ts, "INFO", "Task finished. Total time: " + (rng.nextInt(300) + 60) + "s");

        return sb.toString();
    }

    private void appendLog(StringBuilder sb, DateTimeFormatter fmt, LocalDateTime ts, String level, String msg) {
        sb.append("[").append(ts.format(fmt)).append("] ")
          .append(level)
          .append(" ")
          .append(msg)
          .append("\n");
    }
}
