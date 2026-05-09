package com.lab.plan;

import com.lab.chip.Chip;
import com.lab.chip.ChipRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/**
 * #490: 统一 Plan 进度统计服务
 * 取代散落在 EvaluationResultService、EvaluationTaskService、TaskRecoveryScheduler
 * 中的各种 updatePlanProgress 变体。
 *
 * 终态定义: COMPLETED, FAILED, CANCELLED, SKIPPED
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanProgressService {

    private final EvaluationPlanRepository planRepository;
    private final EvaluationTaskRepository taskRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final ChipRepository chipRepository;

    private static final Set<EvaluationTask.TaskStatus> TERMINAL_STATUSES = Set.of(
            EvaluationTask.TaskStatus.COMPLETED,
            EvaluationTask.TaskStatus.FAILED,
            EvaluationTask.TaskStatus.CANCELLED,
            EvaluationTask.TaskStatus.SKIPPED
    );

    /**
     * 更新 Plan 进度。
     * 查所有任务，算终态完成数和百分比。
     * 全部终态时设 plan 状态（全 FAILED → FAILED，否则 → COMPLETED）。
     *
     * @param planId 评测计划 ID，null 时直接返回
     */
    @Transactional
    public void updateProgress(Long planId) {
        if (planId == null) return;

        EvaluationPlan plan = planRepository.findById(planId).orElse(null);
        if (plan == null) return;

        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);
        int total = (plan.getTotalTasks() != null && plan.getTotalTasks() > 0)
                ? plan.getTotalTasks() : tasks.size();

        long doneCount = tasks.stream()
                .filter(t -> TERMINAL_STATUSES.contains(t.getStatus()))
                .count();

        plan.setCompletedTasks((int) doneCount);
        plan.setProgress(total > 0 ? (int) (doneCount * 100 / total) : 0);

        // 全部任务都是终态 → 决定 Plan 的最终状态
        boolean allTerminal = !tasks.isEmpty() && tasks.stream()
                .allMatch(t -> TERMINAL_STATUSES.contains(t.getStatus()));

        if (allTerminal) {
            long completedCount = tasks.stream()
                    .filter(t -> t.getStatus() == EvaluationTask.TaskStatus.COMPLETED)
                    .count();

            plan.setCompletedAt(Instant.now());
            plan.setProgress(100);
            plan.setCompletedTasks(tasks.size());

            if (completedCount == 0) {
                // 无任何 COMPLETED 任务（全 FAILED/CANCELLED/SKIPPED）→ FAILED
                plan.setStatus(EvaluationPlan.PlanStatus.FAILED);
            } else {
                plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
            }

            log.info("#490: Plan {} all tasks terminal -> {} (completed={}, total={})",
                    plan.getPlanNo(), plan.getStatus(), completedCount, tasks.size());

            // 发布计划完成事件（用于触发报告生成等）
            try {
                eventPublisher.publishEvent(new PlanCompletedEvent(this, planId));
            } catch (Exception e) {
                log.warn("Failed to publish PlanCompletedEvent for plan {}: {}", planId, e.getMessage());
            }

            // #552: 同步更新关联芯片状态
            syncChipStatus(plan);
        }

        planRepository.save(plan);
        log.debug("#490: Plan {} progress: {}/{} ({}%)", plan.getPlanNo(), doneCount, total, plan.getProgress());
    }

    /**
     * #552: 同步更新关联芯片的状态
     * Plan RUNNING → Chip EVALUATING
     * Plan COMPLETED → Chip EVALUATED
     */
    private void syncChipStatus(EvaluationPlan plan) {
        if (plan.getChipId() == null) return;
        chipRepository.findById(plan.getChipId()).ifPresent(chip -> {
            Chip.ChipStatus newStatus = null;
            if (plan.getStatus() == EvaluationPlan.PlanStatus.RUNNING) {
                newStatus = Chip.ChipStatus.EVALUATING;
            } else if (plan.getStatus() == EvaluationPlan.PlanStatus.COMPLETED) {
                newStatus = Chip.ChipStatus.EVALUATED;
            }
            if (newStatus != null && chip.getStatus() != newStatus) {
                Chip.ChipStatus oldStatus = chip.getStatus();
                chip.setStatus(newStatus);
                chipRepository.save(chip);
                log.info("#552: Chip {} status updated: {} -> {} (plan {})",
                        chip.getChipNo(), oldStatus, newStatus, plan.getPlanNo());
            }
        });
    }
}
