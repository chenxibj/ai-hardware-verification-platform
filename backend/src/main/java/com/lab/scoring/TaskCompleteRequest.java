package com.lab.scoring;

import lombok.Data;

/**
 * Agent 回报任务完成结果的请求体
 */
@Data
public class TaskCompleteRequest {
    private Boolean passed;
    private Double latencyMean;
    private Double latencyP50;
    private Double latencyP95;
    private Double latencyP99;
    private Double throughput;
    private Double cpuUtil;
    private Long memoryUsed;
    private String errorMessage;
}
