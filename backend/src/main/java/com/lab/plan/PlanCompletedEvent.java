package com.lab.plan;

import org.springframework.context.ApplicationEvent;

/**
 * 评测计划完成事件 - 触发报告生成
 */
public class PlanCompletedEvent extends ApplicationEvent {
    private final Long planId;

    public PlanCompletedEvent(Object source, Long planId) {
        super(source);
        this.planId = planId;
    }

    public Long getPlanId() { return planId; }
}
