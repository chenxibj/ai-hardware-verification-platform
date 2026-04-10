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
import com.lab.chipreport.ChipReportRepository;
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
    private final ChipReportRepository reportRepo;

    public DashboardController(ChipRepository chipRepo,
                               EvaluationPlanRepository planRepo,
                               EvaluationTaskRepository taskRepo,
                               UserRepository userRepo,
                               ChipReportRepository reportRepo) {
        this.chipRepo = chipRepo;
        this.planRepo = planRepo;
        this.taskRepo = taskRepo;
        this.userRepo = userRepo;
        this.reportRepo = reportRepo;
    }

    /** GET /dashboard — 聚合首页数据 (#320) */
    @GetMapping
    public ApiResponse<Map<String, Object>> dashboard() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("stats", stats().getData());
        data.put("recentActivities", recentActivities().getData());
        return ApiResponse.ok(data);
    }

    @GetMapping("/stats")
    public ApiResponse<Map<String, Object>> stats() {
        long chipCount = chipRepo.count();
        long runningPlans = planRepo.countByStatus(EvaluationPlan.PlanStatus.RUNNING);
        long completedPlans = planRepo.countByStatus(EvaluationPlan.PlanStatus.COMPLETED);
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
        List<Map<String, Object>> activities = new ArrayList<>();
        Map<Long, String> userNames = new HashMap<>();

        var recentPlans = planRepo.findAll(
                PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "createdAt"))
        ).getContent();

        for (var plan : recentPlans) {
            String userName = resolveUser(userNames, plan.getCreatedBy());
            String chipName = chipRepo.findById(plan.getChipId())
                    .map(Chip::getName).orElse("未知芯片");

            Map<String, Object> activity = new LinkedHashMap<>();
            activity.put("time", plan.getCreatedAt() != null ? plan.getCreatedAt().toString() : null);
            activity.put("user", userName);
            activity.put("action", "创建了评测计划");
            activity.put("target", plan.getName() + " (" + chipName + ")");
            activity.put("planNo", plan.getPlanNo());
            activities.add(activity);

            if (plan.getStatus() == EvaluationPlan.PlanStatus.COMPLETED && plan.getCompletedAt() != null) {
                Map<String, Object> ca = new LinkedHashMap<>();
                ca.put("time", plan.getCompletedAt().toString());
                ca.put("user", "系统");
                ca.put("action", "完成了评测计划");
                ca.put("target", plan.getName() + " (" + chipName + ")");
                ca.put("planNo", plan.getPlanNo());
                activities.add(ca);
            }
        }

        var recentTasks = taskRepo.findAll(
                PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "createdAt"))
        ).getContent();

        for (var task : recentTasks) {
            String userName = resolveUser(userNames, task.getCreatedBy());
            Map<String, Object> activity = new LinkedHashMap<>();
            activity.put("time", task.getCreatedAt() != null ? task.getCreatedAt().toString() : null);
            activity.put("user", userName);
            activity.put("action", "创建了评测任务");
            activity.put("target", task.getName());
            activity.put("taskNo", task.getTaskNo());
            activities.add(activity);
        }

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

    /** GET /dashboard/recent-tasks — 最近任务列表 (#320) */
    @GetMapping("/recent-tasks")
    public ApiResponse<List<EvaluationTask>> recentTasks() {
        var tasks = taskRepo.findAll(
                PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "createdAt"))
        ).getContent();
        return ApiResponse.ok(tasks);
    }

    /** GET /dashboard/chip-ranking — 芯片排行 (#320) */
    @GetMapping("/chip-ranking")
    public ApiResponse<List<Map<String, Object>>> chipRanking() {
        List<Chip> chips = chipRepo.findAll();
        List<Map<String, Object>> ranking = new ArrayList<>();
        for (Chip chip : chips) {
            var reports = reportRepo.findByChipId(chip.getId());
            double avgScore = reports.stream()
                    .filter(r -> r.getOverallScore() != null && !Boolean.TRUE.equals(r.getDeleted()))
                    .mapToDouble(r -> r.getOverallScore())
                    .average().orElse(0.0);
            long evalCount = reports.stream()
                    .filter(r -> !Boolean.TRUE.equals(r.getDeleted())).count();

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", chip.getId());
            item.put("chipNo", chip.getChipNo());
            item.put("name", chip.getName());
            item.put("manufacturer", chip.getManufacturer());
            item.put("chipType", chip.getChipType());
            item.put("status", chip.getStatus());
            item.put("evaluationCount", evalCount);
            item.put("averageScore", Math.round(avgScore * 10.0) / 10.0);
            ranking.add(item);
        }
        ranking.sort((a, b) -> Double.compare(
                ((Number) b.get("averageScore")).doubleValue(),
                ((Number) a.get("averageScore")).doubleValue()));
        return ApiResponse.ok(ranking);
    }

    /** GET /dashboard/overview — 总览统计 (#320) */
    @GetMapping("/overview")
    public ApiResponse<Map<String, Object>> overview() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalChips", chipRepo.count());
        data.put("totalPlans", planRepo.count());
        data.put("totalTasks", taskRepo.count());
        data.put("totalUsers", userRepo.count());
        data.put("totalReports", reportRepo.countByDeletedFalse());
        data.put("runningPlans", planRepo.countByStatus(EvaluationPlan.PlanStatus.RUNNING));
        data.put("completedPlans", planRepo.countByStatus(EvaluationPlan.PlanStatus.COMPLETED));
        data.put("runningTasks", taskRepo.countByStatus(EvaluationTask.TaskStatus.RUNNING));
        data.put("completedTasks", taskRepo.countByStatus(EvaluationTask.TaskStatus.COMPLETED));
        data.put("failedTasks", taskRepo.countByStatus(EvaluationTask.TaskStatus.FAILED));
        return ApiResponse.ok(data);
    }

    private String resolveUser(Map<Long, String> cache, Long userId) {
        if (userId == null) return "系统";
        return cache.computeIfAbsent(userId,
                id -> userRepo.findById(id).map(User::getUsername).orElse("系统"));
    }
}
