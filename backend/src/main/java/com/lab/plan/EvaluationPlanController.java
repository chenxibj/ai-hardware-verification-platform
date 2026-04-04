package com.lab.plan;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;

/**
 * 评测计划控制器
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class EvaluationPlanController {

    private final EvaluationPlanService planService;
    private final EvaluationTaskRepository taskRepository;

    @PostMapping("/plans")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> createPlan(
            @RequestBody EvaluationPlan plan,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
        EvaluationPlan created = planService.createPlan(plan, userId);
        return ResponseEntity.ok(success(created));
    }

    @GetMapping("/plans")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> listPlans(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long chipId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        EvaluationPlan.PlanStatus st = status != null ? EvaluationPlan.PlanStatus.valueOf(status) : null;
        Page<EvaluationPlan> plans = planService.listPlans(st, chipId, pageable);
        Map<String, Object> resp = success(plans.getContent());
        resp.put("total", plans.getTotalElements());
        resp.put("page", page);
        resp.put("size", size);
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/plans/{id}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getPlan(@PathVariable Long id) {
        try {
            EvaluationPlan plan = planService.getPlan(id);
            return ResponseEntity.ok(success(plan));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PutMapping("/plans/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> updatePlan(
            @PathVariable Long id,
            @RequestBody EvaluationPlan plan) {
        try {
            EvaluationPlan updated = planService.updatePlan(id, plan);
            return ResponseEntity.ok(success(updated));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PutMapping("/plans/{id}/start")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> startPlan(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(success(planService.startPlan(id)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PutMapping("/plans/{id}/pause")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> pausePlan(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(success(planService.pausePlan(id)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PutMapping("/plans/{id}/resume")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> resumePlan(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(success(planService.resumePlan(id)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PutMapping("/plans/{id}/cancel")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> cancelPlan(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(success(planService.cancelPlan(id)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @GetMapping("/plans/{planId}/tasks")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getPlanTasks(@PathVariable Long planId) {
        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);
        Map<String, Object> resp = success(tasks);
        resp.put("total", tasks.size());
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/chips/{chipId}/plans")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getPlansByChip(@PathVariable Long chipId) {
        List<EvaluationPlan> plans = planService.getPlansByChipId(chipId);
        return ResponseEntity.ok(success(plans));
    }

    private Map<String, Object> success(Object data) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", data);
        return resp;
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 1001);
        resp.put("message", message);
        return resp;
    }
}
