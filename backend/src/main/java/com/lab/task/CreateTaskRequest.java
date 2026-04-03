package com.lab.task;

import com.lab.task.EvaluationTask.*;
import lombok.Data;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 创建任务请求
 */
@Data
public class CreateTaskRequest {

    private String name;

    @NotNull(message = "任务类型不能为空")
    private TaskType taskType;

    @NotNull(message = "评测类型不能为空")
    private EvalType evalType;

    @NotNull(message = "优先级不能为空")
    private Priority priority = Priority.MEDIUM;

    @NotNull(message = "评测配置不能为空")
    private String evalConfig;

    private String datasetIds;

    private String resourceSpec;
}
