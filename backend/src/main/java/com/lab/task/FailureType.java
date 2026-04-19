package com.lab.task;

/**
 * #524: 任务失败类型枚举
 * 区分不同的失败原因，便于统计和展示
 */
public enum FailureType {
    /** 超时 - 任务从未开始执行（progress=0） */
    TIMEOUT_NOT_STARTED,
    /** 超时 - 任务执行过程中超时（progress>0） */
    TIMEOUT_IN_PROGRESS,
    /** Agent 主动报告失败 */
    AGENT_ERROR,
    /** 评测框架/脚本执行失败 */
    EVAL_FAILED
}
