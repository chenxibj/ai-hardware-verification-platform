package com.lab.dashboard;

import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.common.ApiResponse;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.user.User;
import com.lab.user.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/dashboard")
public class DashboardController {

    private final ChipRepository chipRepo;
    private final EvaluationPlanRepository planRepo;
    private final EvaluationTaskRepository taskRepo;
    private final UserRepository userRepo;

    public DashboardController(ChipRepository chipRepo,
                               EvaluationPlanRepository planRepo,
                               EvaluationTaskRepository taskRepo,
                               UserRepository userRepo) {
        this.chipRepo = chipRepo;
        this.planRepo = planRepo;
        this.taskRepo = taskRepo;
        this.userRepo = userRepo;
    }

    @GetMapping("/stats")
    public ApiResponse<Map<String, Object>> stats() {
        long chipCount = chipRepo.count();
        long runningPlans = planRepo.findAll().stream()
                .filter(p -> p.getStatus() == EvaluationPlan.PlanStatus.RUNNING).count();
        long completedPlans = planRepo.findAll().stream()
                .filter(p -> p.getStatus() == EvaluationPlan.PlanStatus.COMPLETED).count();
        long unevaluatedChips = chipRepo.findByStatus(Chip.ChipStatus.UNEVALUATED).size();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("chipCount", chipCount);
        data.put("runningPlans", runningPlans);
        data.put("completedPlans", completedPlans);
        data.put("unevaluatedChips", unevaluatedChips);
        return ApiResponse.ok(data);
    }

    @GetMapping("/recent-activities")
    public ApiResponse<List<Map<String, Object>>> recentActivities() {
        // Gather recent plans and tasks, merge into activity feed
        List<Map<String, Object>> activities = new ArrayList<>();

        // Cache user names
        Map<Long, String> userNames = new HashMap<>();

        // Recent plans (latest 10)
        var recentPlans = planRepo.findAll(
                PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "createdAt"))
        ).getContent();

        for (var plan : recentPlans) {
            String userName = userNames.computeIfAbsent(plan.getCreatedBy(),
                    id -> userRepo.findById(id).map(User::getUsername).orElse("系统"));
            String chipName = chipRepo.findById(plan.getChipId())
                    .map(Chip::getName).orElse("未知芯片");

            Map<String, Object> activity = new LinkedHashMap<>();
            activity.put("time", plan.getCreatedAt() != null ? plan.getCreatedAt().toString() : null);
            activity.put("user", userName);
            activity.put("action", "创建了评测计划");
            activity.put("target", plan.getName() + " (" + chipName + ")");
            activity.put("planNo", plan.getPlanNo());
            activities.add(activity);

            // If plan completed, add completion activity
            if (plan.getStatus() == EvaluationPlan.PlanStatus.COMPLETED && plan.getCompletedAt() != null) {
                Map<String, Object> completeActivity = new LinkedHashMap<>();
                completeActivity.put("time", plan.getCompletedAt().toString());
                completeActivity.put("user", "系统");
                completeActivity.put("action", "完成了评测计划");
                completeActivity.put("target", plan.getName() + " (" + chipName + ")");
                completeActivity.put("planNo", plan.getPlanNo());
                activities.add(completeActivity);
            }
        }

        // Recent tasks (latest 10)
        var recentTasks = taskRepo.findAll(
                PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "createdAt"))
        ).getContent();

        for (var task : recentTasks) {
            String userName = userNames.computeIfAbsent(task.getCreatedBy(),
                    id -> userRepo.findById(id).map(User::getUsername).orElse("系统"));

            Map<String, Object> activity = new LinkedHashMap<>();
            activity.put("time", task.getCreatedAt() != null ? task.getCreatedAt().toString() : null);
            activity.put("user", userName);
            activity.put("action", "创建了评测任务");
            activity.put("target", task.getName());
            activity.put("taskNo", task.getTaskNo());
            activities.add(activity);
        }

        // Sort by time desc, take top 10
        activities.sort((a, b) -> {
            String ta = (String) a.get("time");
            String tb = (String) b.get("time");
            if (ta == null && tb == null) return 0;
            if (ta == null) return 1;
            if (tb == null) return -1;
            return tb.compareTo(ta);
        });

        return ApiResponse.ok(activities.stream().limit(10).collect(Collectors.toList()));
    }

    @GetMapping("/recent-plans")
    public ApiResponse<List<Map<String, Object>>> recentPlans() {
        var plans = planRepo.findAll(
                PageRequest.of(0, 5, Sort.by(Sort.Direction.DESC, "createdAt"))
        ).getContent();

        List<Map<String, Object>> result = new ArrayList<>();
        for (var plan : plans) {
            String chipName = chipRepo.findById(plan.getChipId())
                    .map(Chip::getName).orElse("未知芯片");
            String userName = userRepo.findById(plan.getCreatedBy())
                    .map(User::getUsername).orElse("未知");

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", plan.getId());
            item.put("planNo", plan.getPlanNo());
            item.put("name", plan.getName());
            item.put("chipName", chipName);
            item.put("status", plan.getStatus().name());
            item.put("progress", plan.getProgress());
            item.put("totalTasks", plan.getTotalTasks());
            item.put("completedTasks", plan.getCompletedTasks());
            item.put("createdBy", userName);
            item.put("createdAt", plan.getCreatedAt() != null ? plan.getCreatedAt().toString() : null);
            item.put("updatedAt", plan.getUpdatedAt() != null ? plan.getUpdatedAt().toString() : null);
            result.add(item);
        }

        return ApiResponse.ok(result);
    }
}
