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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 评测任务→任务自动拆分服务
 * 根据评测任务的预设方案（QUICK/STANDARD/FULL），自动拆分为评测任务
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

    private static final List<String> STANDARD_OPERATORS = Arrays.asList(
        "MatMul", "Conv2D", "Softmax", "ReLU", "GELU",
        "SiLU", "LayerNorm", "BatchNorm", "Attention", "ScaledDotProduct",
        "Add", "Mul", "Transpose"
    );

    private static final List<String> COMPREHENSIVE_DTYPES = Arrays.asList("FP32", "FP16", "INT8");

    // ============ 维度分类映射 ============

    private static final Map<String, String> DIMENSION_MAP = new LinkedHashMap<>();
    static {
        // 计算性能
        DIMENSION_MAP.put("MatMul", "计算性能");
        DIMENSION_MAP.put("Conv2D", "计算性能");
        DIMENSION_MAP.put("GEMM", "计算性能");
        DIMENSION_MAP.put("Linear", "计算性能");

        // 归一化
        DIMENSION_MAP.put("Softmax", "归一化");
        DIMENSION_MAP.put("LayerNorm", "归一化");
        DIMENSION_MAP.put("BatchNorm", "归一化");

        // 激活函数
        DIMENSION_MAP.put("ReLU", "激活函数");
        DIMENSION_MAP.put("GELU", "激活函数");
        DIMENSION_MAP.put("SiLU", "激活函数");
        DIMENSION_MAP.put("Sigmoid", "激活函数");
        DIMENSION_MAP.put("Tanh", "激活函数");

        // 注意力机制
        DIMENSION_MAP.put("Attention", "注意力机制");
        DIMENSION_MAP.put("ScaledDotProduct", "注意力机制");

        // 基础运算
        DIMENSION_MAP.put("Add", "基础运算");
        DIMENSION_MAP.put("Mul", "基础运算");
        DIMENSION_MAP.put("Div", "基础运算");
        DIMENSION_MAP.put("Sub", "基础运算");
        DIMENSION_MAP.put("Transpose", "基础运算");
        DIMENSION_MAP.put("Concat", "基础运算");
        DIMENSION_MAP.put("Exp", "基础运算");
        DIMENSION_MAP.put("Log", "基础运算");
        DIMENSION_MAP.put("Sqrt", "基础运算");
        DIMENSION_MAP.put("Abs", "基础运算");
        DIMENSION_MAP.put("Neg", "基础运算");
        DIMENSION_MAP.put("Clamp", "基础运算");
    }

    private static String classifyDimension(String testItem) {
        if (testItem == null) return "其他";
        // Check for MLP/model patterns first
        if (testItem.startsWith("MLP") || testItem.startsWith("ResNet") || testItem.startsWith("BERT")) {
            return "端到端推理";
        }
        return DIMENSION_MAP.getOrDefault(testItem, "其他");
    }

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
            case "COMPREHENSIVE":
                tasks.addAll(createComprehensiveTasks(plan));
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

        // QUICK: 5 operators x FP32
        for (String op : QUICK_OPERATORS) {
            String config = String.format("{\"dtype\":\"FP32\",\"shape\":\"Medium\",\"operator\":\"%s\"}", op);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.OPERATOR, op, config));
        }

        // QUICK: MLP-Small batch=1,4 + MLP-Medium batch=1,4 = 4 model tasks
        for (String model : Arrays.asList("MLP-Small", "MLP-Medium")) {
            for (int batch : new int[]{1, 4}) {
                String config = String.format("{\"model\":\"%s\",\"batchSize\":%d}", model, batch);
                tasks.add(createTask(plan, EvaluationTask.TestSubject.MODEL, model, config));
            }
        }

        return tasks; // total = 5 + 4 = 9
    }

    private List<EvaluationTask> createStandardTasks(EvaluationPlan plan) {
        List<EvaluationTask> tasks = new ArrayList<>();

        // STANDARD: 13 operators x FP32
        for (String op : STANDARD_OPERATORS) {
            String config = String.format("{\"dtype\":\"FP32\",\"shape\":\"Medium\",\"operator\":\"%s\"}", op);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.OPERATOR, op, config));
        }

        // STANDARD: MLP-Medium x 4 batch sizes
        for (int batch : new int[]{1, 4, 8, 16}) {
            String config = String.format("{\"model\":\"MLP-Medium\",\"batchSize\":%d}", batch);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.MODEL, "MLP-Medium", config));
        }

        return tasks; // total = 13 + 4 = 17
    }

    private List<EvaluationTask> createFullTasks(EvaluationPlan plan) {
        List<EvaluationTask> tasks = new ArrayList<>();

        // FULL: all operators (CORE 20 + EXTENDED 30 = 50) x FP32
        List<String> allOperators = new ArrayList<>(CORE_OPERATORS);
        allOperators.addAll(EXTENDED_OPERATORS);

        for (String op : allOperators) {
            String config = String.format("{\"dtype\":\"FP32\",\"shape\":\"Medium\",\"operator\":\"%s\"}", op);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.OPERATOR, op, config));
        }

        // FULL: MLP x 3 sizes x 4 batch sizes = 12 model tasks
        for (String model : Arrays.asList("MLP-Small", "MLP-Medium", "MLP-Large")) {
            for (int batch : new int[]{1, 4, 8, 16}) {
                String config = String.format("{\"model\":\"%s\",\"batchSize\":%d}", model, batch);
                tasks.add(createTask(plan, EvaluationTask.TestSubject.MODEL, model, config));
            }
        }

        return tasks; // total = 50 + 12 = 62
    }

    private List<EvaluationTask> createComprehensiveTasks(EvaluationPlan plan) {
        List<EvaluationTask> tasks = new ArrayList<>();

        // COMPREHENSIVE: CORE operators (20) x 3 dtypes = 60
        for (String op : CORE_OPERATORS) {
            for (String dtype : COMPREHENSIVE_DTYPES) {
                String config = String.format("{\"dtype\":\"%s\",\"shape\":\"Medium\",\"operator\":\"%s\"}", dtype, op);
                tasks.add(createTask(plan, EvaluationTask.TestSubject.OPERATOR, op, config));
            }
        }

        // COMPREHENSIVE: MLP x 3 sizes x 3 batch sizes = 9 model tasks
        for (String model : Arrays.asList("MLP-Small", "MLP-Medium", "MLP-Large")) {
            for (int batch : new int[]{1, 8, 32}) {
                String config = String.format("{\"model\":\"%s\",\"batchSize\":%d}", model, batch);
                tasks.add(createTask(plan, EvaluationTask.TestSubject.MODEL, model, config));
            }
        }

        return tasks; // total = 60 + 9 = 69
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
        // #371: Make testItem unique per config variant (e.g. MLP-Medium/batch=4, MatMul/INT8)
        String uniqueTestItem = testItem;
        if (config != null) {
            StringBuilder suffix = new StringBuilder();
            // Extract dtype
            int dtIdx = config.indexOf("dtype");
            if (dtIdx >= 0) {
                int q1 = config.indexOf('"', config.indexOf(':', dtIdx) + 1);
                int q2 = config.indexOf('"', q1 + 1);
                if (q1 >= 0 && q2 > q1) {
                    String dtype = config.substring(q1 + 1, q2);
                    if (!"FP32".equals(dtype)) suffix.append(dtype);
                }
            }
            // Extract batchSize
            int bsIdx = config.indexOf("batchSize");
            if (bsIdx >= 0) {
                int colon = config.indexOf(':', bsIdx);
                if (colon >= 0) {
                    StringBuilder numBuf = new StringBuilder();
                    for (int ci = colon + 1; ci < config.length(); ci++) {
                        char ch = config.charAt(ci);
                        if (Character.isDigit(ch)) numBuf.append(ch);
                        else if (numBuf.length() > 0) break;
                    }
                    if (numBuf.length() > 0) {
                        if (suffix.length() > 0) suffix.append(",");
                        suffix.append("batch=").append(numBuf);
                    }
                }
            }
            if (suffix.length() > 0) {
                uniqueTestItem = testItem + "/" + suffix;
            }
        }
        task.setTestItem(uniqueTestItem);
        // #371: Use uniqueTestItem for display name
        String nameDetail = uniqueTestItem;
        if (config != null && nameDetail.equals(testItem)) {
            // Fallback: add parenthetical suffix
            String sfx = uniqueTestItem.contains("/") ? uniqueTestItem.substring(uniqueTestItem.indexOf("/") + 1) : "";
            if (!sfx.isEmpty()) nameDetail = testItem + " (" + sfx + ")";
        } else if (uniqueTestItem.contains("/")) {
            String sfx = uniqueTestItem.substring(uniqueTestItem.indexOf("/") + 1);
            nameDetail = testItem + " (" + sfx + ")";
        }
        task.setName(subject.name() + " - " + nameDetail);
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
        task.setDimension(classifyDimension(testItem));
        return task;
    }

    private String generateTaskNo() {
        long seq = TASK_SEQ.incrementAndGet();
        return "TASK-" + seq;
    }

    private String generateTaskNo(Long planId, int index) {
        return "TASK-P" + planId + "-" + index;
    }
}
