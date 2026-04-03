package com.lab.plan;

import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 评测计划→任务自动拆分服务
 * 根据评测计划的预设方案（QUICK/STANDARD/FULL），自动拆分为评测任务
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanTaskSplitter {

    private final EvaluationTaskRepository taskRepository;

    private static final AtomicLong TASK_SEQ = new AtomicLong(System.currentTimeMillis());

    // ============ 算子列表 ============

    private static final List<String> CORE_OPERATORS = Arrays.asList(
        "MatMul", "Conv2D", "Softmax", "ReLU", "GELU",
        "SiLU", "LayerNorm", "BatchNorm", "Attention", "ScaledDotProduct",
        "Add", "Mul", "Div", "Sub", "Exp",
        "Log", "Sqrt", "Abs", "Neg", "Clamp"
    );

    private static final List<String> EXTENDED_OPERATORS = Arrays.asList(
        "Sigmoid", "Tanh", "Sin", "Cos", "Pow",
        "Max", "Min", "Mean", "Sum", "Transpose",
        "Reshape", "Concat", "Split", "Gather", "Scatter",
        "Slice", "Pad", "Pool2D", "AvgPool", "MaxPool",
        "Dropout", "Embedding", "Linear", "BiasAdd", "CrossEntropy",
        "Argmax", "TopK", "Sort", "Where", "Cast"
    );

    private static final List<String> QUICK_OPERATORS = Arrays.asList(
        "MatMul", "Conv2D", "Softmax", "ReLU", "LayerNorm"
    );

    // ============ 公开方法 ============

    public List<EvaluationTask> splitPlanToTasks(EvaluationPlan plan) {
        String preset = extractPreset(plan.getEvalConfig());
        log.info("Splitting plan {} with preset: {}", plan.getPlanNo(), preset);

        List<EvaluationTask> tasks = new ArrayList<>();

        switch (preset) {
            case "QUICK":
                tasks.addAll(createQuickTasks(plan));
                break;
            case "STANDARD":
                tasks.addAll(createStandardTasks(plan));
                break;
            case "FULL":
                tasks.addAll(createFullTasks(plan));
                break;
            default:
                log.warn("Unknown preset '{}' for plan {}, defaulting to STANDARD", preset, plan.getPlanNo());
                tasks.addAll(createStandardTasks(plan));
                break;
        }

        List<EvaluationTask> saved = taskRepository.saveAll(tasks);
        log.info("Created {} tasks for plan {}", saved.size(), plan.getPlanNo());
        return saved;
    }

    // ============ 预设方案实现 ============

    private List<EvaluationTask> createQuickTasks(EvaluationPlan plan) {
        List<EvaluationTask> tasks = new ArrayList<>();

        for (String op : QUICK_OPERATORS) {
            String config = String.format("{\"dtype\":\"FP32\",\"shape\":\"Medium\",\"operator\":\"%s\"}", op);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.OPERATOR, op, config));
        }

        for (String model : Arrays.asList("MLP-Small", "MLP-Medium")) {
            for (int batch : new int[]{1, 4}) {
                String config = String.format("{\"model\":\"%s\",\"batchSize\":%d}", model, batch);
                tasks.add(createTask(plan, EvaluationTask.TestSubject.MODEL, model, config));
            }
        }

        return tasks;
    }

    private List<EvaluationTask> createStandardTasks(EvaluationPlan plan) {
        List<EvaluationTask> tasks = new ArrayList<>();

        List<String> allOperators = new ArrayList<>(CORE_OPERATORS);
        allOperators.addAll(EXTENDED_OPERATORS);

        for (String op : allOperators) {
            String config = String.format("{\"dtype\":\"FP32\",\"shape\":\"Medium\",\"operator\":\"%s\"}", op);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.OPERATOR, op, config));
        }

        for (String model : Arrays.asList("MLP-Small", "MLP-Medium")) {
            for (int batch : new int[]{1, 4, 8, 16}) {
                String config = String.format("{\"model\":\"%s\",\"batchSize\":%d}", model, batch);
                tasks.add(createTask(plan, EvaluationTask.TestSubject.MODEL, model, config));
            }
        }

        return tasks;
    }

    private List<EvaluationTask> createFullTasks(EvaluationPlan plan) {
        List<EvaluationTask> tasks = new ArrayList<>();

        // 标准评测所有任务
        tasks.addAll(createStandardTasks(plan));

        // 核心算子 FP16
        for (String op : CORE_OPERATORS) {
            String config = String.format("{\"dtype\":\"FP16\",\"shape\":\"Medium\",\"operator\":\"%s\"}", op);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.OPERATOR, op, config));
        }

        // 核心算子 Large shape
        for (String op : CORE_OPERATORS) {
            String config = String.format("{\"dtype\":\"FP32\",\"shape\":\"Large\",\"operator\":\"%s\"}", op);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.OPERATOR, op, config));
        }

        // 额外模型
        for (String model : Arrays.asList("ResNet", "BERT-Tiny")) {
            for (int batch : new int[]{1, 4, 8, 16}) {
                String config = String.format("{\"model\":\"%s\",\"batchSize\":%d}", model, batch);
                tasks.add(createTask(plan, EvaluationTask.TestSubject.MODEL, model, config));
            }
        }

        return tasks;
    }

    // ============ 辅助方法 ============

    private String extractPreset(String evalConfig) {
        if (evalConfig == null || evalConfig.isBlank()) {
            return "STANDARD";
        }
        int idx = evalConfig.indexOf("\"preset\"");
        if (idx < 0) {
            return "STANDARD";
        }
        int colonIdx = evalConfig.indexOf(':', idx);
        if (colonIdx < 0) {
            return "STANDARD";
        }
        int firstQuote = evalConfig.indexOf('"', colonIdx + 1);
        if (firstQuote < 0) {
            return "STANDARD";
        }
        int secondQuote = evalConfig.indexOf('"', firstQuote + 1);
        if (secondQuote < 0) {
            return "STANDARD";
        }
        return evalConfig.substring(firstQuote + 1, secondQuote).toUpperCase();
    }

    private EvaluationTask createTask(EvaluationPlan plan,
                                       EvaluationTask.TestSubject subject,
                                       String testItem,
                                       String config) {
        EvaluationTask task = new EvaluationTask();
        task.setPlanId(plan.getId());
        task.setChipId(plan.getChipId());
        task.setTestSubject(subject);
        task.setTestItem(testItem);
        task.setName(subject.name() + " - " + testItem);
        task.setTaskNo(generateTaskNo());
        task.setTaskType(EvaluationTask.TaskType.TEMPLATE);
        task.setEvalType(subject == EvaluationTask.TestSubject.OPERATOR
                ? EvaluationTask.EvalType.OPERATOR
                : EvaluationTask.EvalType.MODEL);
        task.setEvalConfig(config);
        task.setStatus(EvaluationTask.TaskStatus.PENDING);
        task.setPriority(EvaluationTask.Priority.MEDIUM);
        task.setProgress(0);
        task.setCreatedBy(plan.getCreatedBy());
        return task;
    }

    private String generateTaskNo() {
        long seq = TASK_SEQ.incrementAndGet();
        return "TASK-" + seq;
    }
}
