package com.lab.plan;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;

/**
 * 评测任务控制器
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class EvaluationPlanController {

    private final EvaluationPlanService planService;
    private final EvaluationTaskRepository taskRepository;

    /**
     * #366: 从 SecurityContext 获取当前用户 ID
     */
    private Long getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof User user) {
            return user.getId();
        }
        return 1L;
    }

    @PostMapping("/plans")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> createPlan(@RequestBody EvaluationPlan plan) {
        Long userId = getCurrentUserId();
        try {
            EvaluationPlan created = planService.createPlan(plan, userId);
            return ResponseEntity.ok(success(created));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @GetMapping("/plans")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> listPlans(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long chipId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt,desc") String sort) {
        String[] sortParts = sort.split(",");
        String sortField = sortParts[0];
        Sort.Direction direction = sortParts.length > 1 && sortParts[1].equalsIgnoreCase("asc")
                ? Sort.Direction.ASC : Sort.Direction.DESC;
        Pageable pageable = PageRequest.of(page, size, Sort.by(direction, sortField));
        EvaluationPlan.PlanStatus st = null;
        if (status != null) {
            try {
                st = EvaluationPlan.PlanStatus.valueOf(status);
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(error("无效的计划状态: " + status));
            }
        }
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
            return handlePlanException(e);
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
            return handlePlanException(e);
        }
    }

    @PutMapping("/plans/{id}/start")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> startPlan(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(success(planService.startPlan(id)));
        } catch (Exception e) {
            return handlePlanException(e);
        }
    }

    @PutMapping("/plans/{id}/pause")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> pausePlan(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(success(planService.pausePlan(id)));
        } catch (Exception e) {
            return handlePlanException(e);
        }
    }

    @PutMapping("/plans/{id}/resume")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> resumePlan(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(success(planService.resumePlan(id)));
        } catch (Exception e) {
            return handlePlanException(e);
        }
    }

    @PutMapping("/plans/{id}/cancel")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> cancelPlan(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(success(planService.cancelPlan(id)));
        } catch (Exception e) {
            return handlePlanException(e);
        }
    }

    @PostMapping("/plans/{id}/copy")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> copyPlan(@PathVariable Long id) {
        try {
            Long userId = getCurrentUserId();
            return ResponseEntity.ok(success(planService.copyPlan(id, userId)));
        } catch (Exception e) {
            return handlePlanException(e);
        }
    }

    @GetMapping("/plans/stats")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getPlanStats() {
        Map<String, Object> statsData = new HashMap<>();
        long total = planService.countAll();
        long running = planService.countByStatus(EvaluationPlan.PlanStatus.RUNNING);
        long completed = planService.countByStatus(EvaluationPlan.PlanStatus.COMPLETED);
        long failed = planService.countByStatus(EvaluationPlan.PlanStatus.FAILED);
        long draft = planService.countByStatus(EvaluationPlan.PlanStatus.DRAFT);
        long paused = planService.countByStatus(EvaluationPlan.PlanStatus.PAUSED);
        statsData.put("total", total);
        statsData.put("running", running);
        statsData.put("completed", completed);
        statsData.put("failed", failed);
        statsData.put("draft", draft);
        statsData.put("paused", paused);
        return ResponseEntity.ok(success(statsData));
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

    private ResponseEntity<Map<String, Object>> handlePlanException(Exception e) {
        String msg = e.getMessage();
        if (msg != null && (msg.contains("not found") || msg.contains("不存在"))) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("评测计划不存在"));
        }
        return ResponseEntity.badRequest().body(error(msg));
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
