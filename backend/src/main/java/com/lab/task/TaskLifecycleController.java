package com.lab.task;

import java.util.HashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/tasks")
public class TaskLifecycleController {

    private final EvaluationTaskRepository taskRepository;

    public TaskLifecycleController(EvaluationTaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    @PostMapping("/{taskId}/pause")
    public ResponseEntity<Map<String, Object>> pause(@PathVariable Long taskId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        
        String status = task.getStatus();
        if (!"RUNNING".equals(status) && !"PENDING".equals(status)) {
            Map<String, Object> err = new HashMap<>();
            err.put("code", 1001);
            err.put("message", "Only RUNNING or PENDING tasks can be paused, current: " + status);
            return ResponseEntity.badRequest().body(err);
        }

        task.setStatus("PAUSED");
        taskRepository.save(task);

        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        response.put("data", task);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{taskId}/resume")
    public ResponseEntity<Map<String, Object>> resume(@PathVariable Long taskId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        
        String status = task.getStatus();
        if (!"PAUSED".equals(status)) {
            Map<String, Object> err = new HashMap<>();
            err.put("code", 1001);
            err.put("message", "Only PAUSED tasks can be resumed, current: " + status);
            return ResponseEntity.badRequest().body(err);
        }

        task.setStatus("PENDING");
        taskRepository.save(task);

        Map<String, Object> response = new HashMap<>();
        response.put("code", 0);
        response.put("message", "success");
        response.put("data", task);
        return ResponseEntity.ok(response);
    }
}
