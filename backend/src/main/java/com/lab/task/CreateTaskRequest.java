package com.lab.task;

import com.lab.task.EvaluationTask.*;
import lombok.Data;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 创建任务请求
 */
@Data
public class CreateTaskRequest {

    @NotBlank(message = "任务名称不能为空")
    @Size(max = 200, message = "任务名称不能超过200个字符")
    @Pattern(regexp = "^[^<>]*$", message = "任务名称不能包含HTML标签字符")
    private String name;

    @NotNull(message = "任务类型不能为空")
    private TaskType taskType;

    @NotNull(message = "评测类型不能为空")
    private EvalType evalType;

    @NotNull(message = "优先级不能为空")
    private Priority priority = Priority.MEDIUM;

    @NotNull(message = "评测配置不能为空")
    private String evalConfig;

    private Long[] datasetIds;

    private String resourceSpec;

    // #364: 新增字段
    private Long planId;

    private Long chipId;

    private TestSubject testSubject;

    private String testItem;
}
