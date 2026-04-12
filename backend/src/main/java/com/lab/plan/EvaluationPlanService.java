package com.lab.plan;

import com.lab.chip.ChipRepository;
import com.lab.template.TaskTemplateRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.TaskDispatcher;
import com.lab.result.EvaluationResultRepository;
import com.lab.chipreport.ChipReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import com.lab.common.XssUtils;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import com.lab.gpu.GpuSlotService;

/**
 * 评测任务服务 - CRUD + 状态流转
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EvaluationPlanService {

    private final EvaluationPlanRepository planRepository;
    private final ChipRepository chipRepository;
    private final TaskTemplateRepository templateRepository;
    private final com.lab.task.EvaluationTaskRepository taskRepository;
    private final EvaluationResultRepository resultRepository;
    private final ChipReportRepository chipReportRepository;
    private final PlanTaskSplitter planTaskSplitter;
    private final TaskDispatcher taskDispatcher;
    private final GpuSlotService gpuSlotService;

    // ============ CRUD ============

    @Transactional
    public EvaluationPlan createPlan(EvaluationPlan plan, Long userId) {
        // #329: 参数校验
        if (plan.getName() == null || plan.getName().isBlank()) {
            throw new RuntimeException("评测计划名称不能为空");
        }
        // XSS sanitization (#331)
        plan.setName(XssUtils.stripXss(plan.getName()));
        if (plan.getDescription() != null) plan.setDescription(XssUtils.stripXss(plan.getDescription()));
        if (plan.getChipId() == null) {
            throw new RuntimeException("芯片ID不能为空");
        }
        // 验证芯片存在
        chipRepository.findById(plan.getChipId())
                .orElseThrow(() -> new RuntimeException("芯片不存在: " + plan.getChipId()));

        // #370: 验证模板存在
        if (plan.getTemplateId() != null) {
            templateRepository.findById(plan.getTemplateId())
                    .orElseThrow(() -> new RuntimeException("评测模板不存在: " + plan.getTemplateId()));
        }


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
                plan.setEvalConfig(config.substring(0, config.lastIndexOf('}'))
                    + ",\"preset\":\"" + preset.toUpperCase() + "\"}");
            }
        }
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Created evaluation task: {} ({})", saved.getPlanNo(), saved.getName());

        // 自动拆分任务
        List<EvaluationTask> tasks = planTaskSplitter.splitPlanToTasks(saved);
        saved.setTotalTasks(tasks.size());
        saved = planRepository.save(saved);
        log.info("Evaluation task {} auto-split into {} sub-tasks", saved.getPlanNo(), tasks.size());

        return saved;
    }

    @Transactional(readOnly = true)
    public Page<EvaluationPlan> listPlans(EvaluationPlan.PlanStatus status, Long chipId, Pageable pageable) {
        Page<EvaluationPlan> page;
        if (chipId != null) {
            page = planRepository.findByChipId(chipId, pageable);
        } else if (status != null) {
            page = planRepository.findByStatus(status, pageable);
        } else {
            page = planRepository.findAll(pageable);
        }
        enrichPlans(page.getContent());
        return page;
    }

    @Transactional(readOnly = true)
    public EvaluationPlan getPlan(Long id) {
        EvaluationPlan plan = planRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Evaluation task not found: " + id));
        enrichPlan(plan);
        return plan;
    }

    @Transactional(readOnly = true)
    public List<EvaluationPlan> getPlansByChipId(Long chipId) {
        List<EvaluationPlan> plans = planRepository.findByChipId(chipId);
        enrichPlans(plans);
        return plans;
    }

    @Transactional
    public EvaluationPlan updatePlan(Long id, EvaluationPlan update) {
        EvaluationPlan plan = getPlan(id);
        if (plan.getStatus() != EvaluationPlan.PlanStatus.DRAFT) {
            throw new RuntimeException("Only DRAFT evaluation tasks can be edited");
        }
        if (update.getName() != null) plan.setName(update.getName());
        if (update.getDescription() != null) plan.setDescription(update.getDescription());
        if (update.getChipId() != null) plan.setChipId(update.getChipId());
        if (update.getEvalConfig() != null) plan.setEvalConfig(update.getEvalConfig());
        if (update.getNodeId() != null) plan.setNodeId(update.getNodeId());
        if (update.getTotalTasks() != null) plan.setTotalTasks(update.getTotalTasks());
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Updated evaluation task: {}", saved.getPlanNo());
        return saved;
    }

    // ============ 状态流转 ============

    /**
     * #354: startPlan 只更新状态并立即返回，任务分发改为异步
     * #356: 幂等检查 — RUNNING 状态的 Plan 不重复 start，直接返回成功
     */
    @Transactional
    public EvaluationPlan startPlan(Long id) {
        EvaluationPlan plan = getPlan(id);

        // #356: 幂等保护 — 已经 RUNNING 的 Plan 直接返回，不重复分发
        if (plan.getStatus() == EvaluationPlan.PlanStatus.RUNNING) {
            log.info("Plan {} is already RUNNING, idempotent return", plan.getPlanNo());
            return plan;
        }

        assertStatus(plan, EvaluationPlan.PlanStatus.DRAFT, "start");
        plan.setStatus(EvaluationPlan.PlanStatus.RUNNING);
        plan.setStartedAt(Instant.now());
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Started evaluation task: {}", saved.getPlanNo());

        // #354: 异步分发任务 — dispatchPlanTasks 是 @Async，不阻塞当前请求
        try {
            taskDispatcher.dispatchPlanTasks(saved.getId());
        } catch (Exception e) {
            log.error("Failed to trigger async dispatch for plan {}: {}", saved.getPlanNo(), e.getMessage());
            // 不回滚 Plan 状态 — Recovery scheduler 会重新分发
        }

        return saved;
    }

    @Transactional
    public EvaluationPlan pausePlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        assertStatus(plan, EvaluationPlan.PlanStatus.RUNNING, "pause");
        plan.setStatus(EvaluationPlan.PlanStatus.PAUSED);
        EvaluationPlan saved = planRepository.save(plan);

        // #381: Pause underlying tasks (RUNNING/QUEUED/PENDING -> PAUSED)
        int paused = 0;
        for (EvaluationTask.TaskStatus st : List.of(
                EvaluationTask.TaskStatus.RUNNING,
                EvaluationTask.TaskStatus.QUEUED,
                EvaluationTask.TaskStatus.PENDING)) {
            List<EvaluationTask> tasks = taskRepository.findByPlanIdAndStatus(id, st);
            for (EvaluationTask task : tasks) {
                task.setStatus(EvaluationTask.TaskStatus.PAUSED);
                taskRepository.save(task);
                paused++;
            }
        }
        log.info("Paused evaluation task: {} ({} tasks paused)", saved.getPlanNo(), paused);
        return saved;
    }

    @Transactional
    public EvaluationPlan resumePlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        // #356: 幂等保护
        if (plan.getStatus() == EvaluationPlan.PlanStatus.RUNNING) {
            log.info("Plan {} is already RUNNING, idempotent return", plan.getPlanNo());
            return plan;
        }
        assertStatus(plan, EvaluationPlan.PlanStatus.PAUSED, "resume");
        plan.setStatus(EvaluationPlan.PlanStatus.RUNNING);
        EvaluationPlan saved = planRepository.save(plan);

        // #381/#407: Resume PAUSED tasks — 方案A: 有 assignedNodeId 的设为 DISPATCHED，没有的设为 QUEUED
        List<EvaluationTask> pausedTasks = taskRepository.findByPlanIdAndStatus(id, EvaluationTask.TaskStatus.PAUSED);
        int resumedDispatched = 0;
        int resumedQueued = 0;
        for (EvaluationTask task : pausedTasks) {
            if (task.getAssignedNodeId() != null) {
                // #407: 有分配节点（可能有 GPU Slot），设为 DISPATCHED 让 Agent 重新拉取
                task.setStatus(EvaluationTask.TaskStatus.DISPATCHED);
                resumedDispatched++;
            } else {
                // 没有分配节点，回到 QUEUED 等待调度
                task.setStatus(EvaluationTask.TaskStatus.QUEUED);
                resumedQueued++;
            }
            taskRepository.save(task);
        }
        log.info("Resumed evaluation task: {} ({} tasks->DISPATCHED, {} tasks->QUEUED)",
                saved.getPlanNo(), resumedDispatched, resumedQueued);

        // #354: 异步分发
        try {
            taskDispatcher.dispatchPlanTasks(saved.getId());
        } catch (Exception e) {
            log.error("Failed to dispatch tasks after resuming plan {}: {}", saved.getPlanNo(), e.getMessage());
        }

        return saved;
    }

    /**
     * #401: Cancel plan and all its non-terminal child tasks
     * Releases GPU slots for RUNNING/DISPATCHED tasks
     */
    @Transactional
    public EvaluationPlan cancelPlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        if (plan.getStatus() == EvaluationPlan.PlanStatus.COMPLETED ||
            plan.getStatus() == EvaluationPlan.PlanStatus.CANCELLED) {
            throw new RuntimeException("Cannot cancel a " + plan.getStatus() + " evaluation task");
        }
        plan.setStatus(EvaluationPlan.PlanStatus.CANCELLED);
        plan.setCompletedAt(Instant.now());
        EvaluationPlan saved = planRepository.save(plan);

        // #401: Cancel all non-terminal child tasks
        int cancelled = 0;
        for (EvaluationTask.TaskStatus st : List.of(
                EvaluationTask.TaskStatus.RUNNING,
                EvaluationTask.TaskStatus.DISPATCHED,
                EvaluationTask.TaskStatus.QUEUED,
                EvaluationTask.TaskStatus.PENDING,
                EvaluationTask.TaskStatus.PAUSED)) {
            List<EvaluationTask> tasks = taskRepository.findByPlanIdAndStatus(id, st);
            for (EvaluationTask task : tasks) {
                // Release GPU slots for RUNNING/DISPATCHED tasks
                if (st == EvaluationTask.TaskStatus.RUNNING || st == EvaluationTask.TaskStatus.DISPATCHED) {
                    try {
                        gpuSlotService.releaseGpuSlots(task.getId());
                    } catch (Exception e) {
                        log.warn("Failed to release GPU slots for task {}: {}", task.getTaskNo(), e.getMessage());
                    }
                }
                task.setStatus(EvaluationTask.TaskStatus.CANCELLED);
                task.setCompletedAt(Instant.now());
                taskRepository.save(task);
                cancelled++;
            }
        }
        log.info("Cancelled evaluation task: {} ({} child tasks cancelled)", saved.getPlanNo(), cancelled);
        return saved;
    }

    @Transactional
    public EvaluationPlan completePlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        assertStatus(plan, EvaluationPlan.PlanStatus.RUNNING, "complete");
        plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
        plan.setCompletedAt(Instant.now());
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Completed evaluation task: {}", saved.getPlanNo());
        return saved;
    }

    @Transactional
    public EvaluationPlan failPlan(Long id) {
        EvaluationPlan plan = getPlan(id);
        assertStatus(plan, EvaluationPlan.PlanStatus.RUNNING, "fail");
        plan.setStatus(EvaluationPlan.PlanStatus.FAILED);
        plan.setCompletedAt(Instant.now());
        EvaluationPlan saved = planRepository.save(plan);
        log.info("Failed evaluation task: {}", saved.getPlanNo());
        return saved;
    }

    /**
     * 拷贝评测任务 — 创建新的 DRAFT 副本 + 自动拆分子任务
     */
    @Transactional
    public EvaluationPlan copyPlan(Long sourceId, Long userId) {
        EvaluationPlan source = getPlan(sourceId);

        EvaluationPlan copy = new EvaluationPlan();
        copy.setPlanNo(generatePlanNo());
        copy.setName(source.getName() + "(副本)");
        copy.setDescription(source.getDescription());
        copy.setChipId(source.getChipId());
        copy.setTemplateId(source.getTemplateId());
        copy.setEvalConfig(source.getEvalConfig());
        copy.setNodeId(source.getNodeId());
        copy.setStatus(EvaluationPlan.PlanStatus.DRAFT);
        copy.setTotalTasks(0);
        copy.setCompletedTasks(0);
        copy.setProgress(0);
        copy.setCreatedBy(userId);

        EvaluationPlan saved = planRepository.save(copy);
        log.info("Copied evaluation task {} -> {} ({})", source.getPlanNo(), saved.getPlanNo(), saved.getName());

        // 自动拆分子任务
        List<EvaluationTask> tasks = planTaskSplitter.splitPlanToTasks(saved);
        saved.setTotalTasks(tasks.size());
        saved = planRepository.save(saved);
        log.info("Copied evaluation task {} auto-split into {} sub-tasks", saved.getPlanNo(), tasks.size());

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


    /**
     * #324: Enrich plan with chipName and templateName from related entities
     */
    private void enrichPlan(EvaluationPlan plan) {
        if (plan.getChipId() != null) {
            chipRepository.findById(plan.getChipId()).ifPresent(chip -> plan.setChipName(chip.getName()));
        }
        if (plan.getTemplateId() != null) {
            templateRepository.findById(plan.getTemplateId()).ifPresent(t -> plan.setTemplateName(t.getName()));
        }
    }

    private void enrichPlans(java.util.List<EvaluationPlan> plans) {
        plans.forEach(this::enrichPlan);
    }

    // ============ Helpers ============

    private void assertStatus(EvaluationPlan plan, EvaluationPlan.PlanStatus expected, String action) {
        if (plan.getStatus() != expected) {
            throw new RuntimeException("Cannot " + action + " evaluation task in status " + plan.getStatus()
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
