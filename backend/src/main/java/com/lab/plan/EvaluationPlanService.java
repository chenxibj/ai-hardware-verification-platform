package com.lab.plan;

import com.lab.task.EvaluationTask;
import com.lab.result.EvaluationResultRepository;
import com.lab.chipreport.ChipReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 评测计划服务 - CRUD + 状态流转
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EvaluationPlanService {

    private final EvaluationPlanRepository planRepository;
    private final com.lab.task.EvaluationTaskRepository taskRepository;
    private final EvaluationResultRepository resultRepository;
    private final ChipReportRepository chipReportRepository;
    private final PlanTaskSplitter planTaskSplitter;

    // ============ CRUD ============

    @Transactional
    public EvaluationPlan createPlan(EvaluationPlan plan, Long userId) {
        plan.setPlanNo(generatePlanNo());
        plan.setCreatedBy(userId);
        if (plan.getStatus() == null) {
            plan.setStatus(EvaluationPlan.PlanStatus.DRAFT);
        }
        // 将 preset 保存到 evalConfig 中
        String preset = plan.getPreset();
        if (preset != null && !preset.isBlank()) {
            String config = plan.getEvalConfig();
            if (config == null || config.isBlank() || config.equals("{}") || config.equals("null")) {
                plan.setEvalConfig("{\"preset\":\"" + preset.toUpperCase() + "\"}");
            } else if (!config.contains("\"preset\"")) {
                // 在已有 JSON 中注入 preset
                plan.setEvalConfig(config.substring(0, config.lastIndexOf('}'))
                    + ",\"preset\":\"" + preset.toUpperCase() + "\"}");
            }
        }
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Created plan: {} ({})", saved.getPlanNo(), saved.getName());

        // 自动拆分任务
        List<EvaluationTask> tasks = planTaskSplitter.splitPlanToTasks(saved);
        saved.setTotalTasks(tasks.size());
        saved = planRepository.save(saved);
        log.info("Plan {} auto-split into {} tasks", saved.getPlanNo(), tasks.size());

        return saved;
    }

    @Transactional(readOnly = true)
    public Page<EvaluationPlan> listPlans(EvaluationPlan.PlanStatus status, Long chipId, Pageable pageable) {
        if (chipId != null) {
            return planRepository.findByChipId(chipId, pageable);
        } else if (status != null) {
            return planRepository.findByStatus(status, pageable);
        }
        return planRepository.findAll(pageable);
    }

    @Transactional(readOnly = true)
    public EvaluationPlan getPlan(Long id) {
        return planRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + id));
    }

    @Transactional(readOnly = true)
    public List<EvaluationPlan> getPlansByChipId(Long chipId) {
        return planRepository.findByChipId(chipId);
    }

    @Transactional
    public EvaluationPlan updatePlan(Long id, EvaluationPlan update) {
        EvaluationPlan plan = getPlan(id);
        if (plan.getStatus() != EvaluationPlan.PlanStatus.DRAFT) {
            throw new RuntimeException("Only DRAFT plans can be edited");
        }
        if (update.getName() != null) plan.setName(update.getName());
        if (update.getDescription() != null) plan.setDescription(update.getDescription());
        if (update.getChipId() != null) plan.setChipId(update.getChipId());
        if (update.getEvalConfig() != null) plan.setEvalConfig(update.getEvalConfig());
        if (update.getNodeId() != null) plan.setNodeId(update.getNodeId());
        if (update.getTotalTasks() != null) plan.setTotalTasks(update.getTotalTasks());
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Updated plan: {}", saved.getPlanNo());
        return saved;
    }

    // ============ 状态流转 ============

    @Transactional
    public EvaluationPlan startPlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        assertStatus(plan, EvaluationPlan.PlanStatus.DRAFT, "start");
        plan.setStatus(EvaluationPlan.PlanStatus.RUNNING);
        plan.setStartedAt(Instant.now());
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Started plan: {}", saved.getPlanNo());
        return saved;
    }

    @Transactional
    public EvaluationPlan pausePlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        assertStatus(plan, EvaluationPlan.PlanStatus.RUNNING, "pause");
        plan.setStatus(EvaluationPlan.PlanStatus.PAUSED);
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Paused plan: {}", saved.getPlanNo());
        return saved;
    }

    @Transactional
    public EvaluationPlan resumePlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        assertStatus(plan, EvaluationPlan.PlanStatus.PAUSED, "resume");
        plan.setStatus(EvaluationPlan.PlanStatus.RUNNING);
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Resumed plan: {}", saved.getPlanNo());
        return saved;
    }

    @Transactional
    public EvaluationPlan cancelPlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        if (plan.getStatus() == EvaluationPlan.PlanStatus.COMPLETED ||
            plan.getStatus() == EvaluationPlan.PlanStatus.CANCELLED) {
            throw new RuntimeException("Cannot cancel a " + plan.getStatus() + " plan");
        }
        plan.setStatus(EvaluationPlan.PlanStatus.CANCELLED);
        plan.setCompletedAt(Instant.now());
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Cancelled plan: {}", saved.getPlanNo());
        return saved;
    }

    @Transactional
    public EvaluationPlan completePlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        assertStatus(plan, EvaluationPlan.PlanStatus.RUNNING, "complete");
        plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
        plan.setCompletedAt(Instant.now());
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Completed plan: {}", saved.getPlanNo());
        return saved;
    }

    @Transactional
    public EvaluationPlan failPlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        assertStatus(plan, EvaluationPlan.PlanStatus.RUNNING, "fail");
        plan.setStatus(EvaluationPlan.PlanStatus.FAILED);
        plan.setCompletedAt(Instant.now());
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Failed plan: {}", saved.getPlanNo());
        return saved;
    }



    @Transactional
    public EvaluationPlan retryPlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        if (plan.getStatus() != EvaluationPlan.PlanStatus.COMPLETED
                && plan.getStatus() != EvaluationPlan.PlanStatus.FAILED) {
            throw new RuntimeException("Only COMPLETED or FAILED plans can be retried (current: " + plan.getStatus() + ")");
        }

        // Delete associated results and reports
        resultRepository.deleteAll(resultRepository.findByPlanId(id));
        chipReportRepository.deleteAll(chipReportRepository.findByPlanId(id));

        // Reset tasks
        List<EvaluationTask> tasks = taskRepository.findByPlanId(id);
        for (EvaluationTask task : tasks) {
            if (task.getStatus() == EvaluationTask.TaskStatus.COMPLETED
                    || task.getStatus() == EvaluationTask.TaskStatus.FAILED) {
                task.setStatus(EvaluationTask.TaskStatus.PENDING);
                task.setProgress(0);
                task.setStartedAt(null);
                task.setCompletedAt(null);
                taskRepository.save(task);
            }
        }

        // Reset plan
        plan.setStatus(EvaluationPlan.PlanStatus.DRAFT);
        plan.setStartedAt(null);
        plan.setCompletedAt(null);
        plan.setProgress(0);
        plan.setCompletedTasks(0);
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Retried plan: {} - reset to DRAFT", saved.getPlanNo());
        return saved;
    }

    // ============ Stats (#199) ============

    @Transactional(readOnly = true)
    public long countAll() {
        return planRepository.count();
    }

    @Transactional(readOnly = true)
    public long countByStatus(EvaluationPlan.PlanStatus status) {
        return planRepository.countByStatus(status);
    }

    // ============ Helpers ============

    private void assertStatus(EvaluationPlan plan, EvaluationPlan.PlanStatus expected, String action) {
        if (plan.getStatus() != expected) {
            throw new RuntimeException("Cannot " + action + " plan in status " + plan.getStatus()
                    + " (expected " + expected + ")");
        }
    }

    private String generatePlanNo() {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneId.of("Asia/Shanghai"))
                .format(Instant.now());
        String seq = String.format("%03d", (int) (Math.random() * 1000));
        return "PLAN-" + date + "-" + seq;
    }
}
