package com.lab.task;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * 日志保留策略 — 定时清理超过 90 天的任务日志
 * #233: P1-5
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TaskLogCleanupScheduler {

    private final TaskLogRepository taskLogRepository;

    /**
     * 每天凌晨 3 点执行清理
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void cleanupOldLogs() {
        Instant cutoff = Instant.now().minus(90, ChronoUnit.DAYS);
        try {
            int deleted = taskLogRepository.deleteByCreatedAtBefore(cutoff);
            if (deleted > 0) {
                log.info("Cleaned up {} old log entries (before {})", deleted, cutoff);
            } else {
                log.debug("No old log entries to clean up (cutoff: {})", cutoff);
            }
        } catch (Exception e) {
            log.error("Failed to cleanup old logs: {}", e.getMessage(), e);
        }
    }
}
