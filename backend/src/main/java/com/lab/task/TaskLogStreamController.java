package com.lab.task;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 评测任务实时日志SSE推送控制器 (#327)
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class TaskLogStreamController {

    private final TaskLogRepository taskLogRepository;

    private final ScheduledExecutorService sseScheduler =
            Executors.newScheduledThreadPool(2);

    /**
     * GET /tasks/{taskId}/logs/stream — SSE实时日志推送
     * 每2秒推送最新日志行，客户端用 EventSource 连接
     */
    @GetMapping(value = "/{taskId}/logs/stream",
                produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamTaskLogs(@PathVariable Long taskId) {
        SseEmitter emitter = new SseEmitter(300_000L); // 5 min timeout

        final long[] lastId = {0L};

        var future = sseScheduler.scheduleAtFixedRate(() -> {
            try {
                List<TaskLog> newLogs = taskLogRepository.findFiltered(
                        taskId,
                        lastId[0] > 0 ? lastId[0] : null,
                        null, null,
                        PageRequest.of(0, 50));
                for (TaskLog entry : newLogs) {
                    Map<String, Object> event = new HashMap<>();
                    event.put("id", entry.getId());
                    event.put("level", entry.getLevel());
                    event.put("message", entry.getMessage());
                    event.put("content", entry.getContent());
                    event.put("logType", entry.getLogType());
                    event.put("createdAt", entry.getCreatedAt());
                    emitter.send(SseEmitter.event()
                            .id(String.valueOf(entry.getId()))
                            .name("log")
                            .data(event));
                    lastId[0] = entry.getId();
                }
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
        }, 0, 2, TimeUnit.SECONDS);

        emitter.onCompletion(() -> future.cancel(true));
        emitter.onTimeout(() -> {
            future.cancel(true);
            emitter.complete();
        });
        emitter.onError(e -> future.cancel(true));

        return emitter;
    }
}
