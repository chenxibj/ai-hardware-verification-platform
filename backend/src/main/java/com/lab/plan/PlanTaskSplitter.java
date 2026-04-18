package com.lab.plan;

import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.runspec.RunSpecRepository;
import com.lab.template.TaskTemplate;
import com.lab.template.TaskTemplateRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

/**
 * 评测任务→任务自动拆分服务
 * 根据评测任务的预设方案（QUICK/STANDARD/FULL），自动拆分为评测任务
 * #464: 支持模板驱动拆分 — 从模板 configJson 读取 operators/models/training
 * #465: 支持 TRAINING 任务拆分
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanTaskSplitter {

    private final EvaluationTaskRepository taskRepository;
    private final RunSpecRepository runSpecRepository;
    private final TaskTemplateRepository taskTemplateRepository;

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

    private static String classifyDimension(String testItem) {
        return com.lab.dimension.DimensionRegistry.getKeyByOperator(testItem);
    }

    // ============ 公开方法 ============

    public List<EvaluationTask> splitPlanToTasks(EvaluationPlan plan) {
        String preset = extractPreset(plan.getEvalConfig());
        log.info("Splitting plan {} with preset: {}", plan.getPlanNo(), preset);

        List<EvaluationTask> tasks = new ArrayList<>();

        // #464: Template-driven splitting — if evalConfig has templateId and the template
        // configJson has explicit operators/models/training, use those instead of preset
        Long templateId = extractTemplateId(plan.getEvalConfig());
        if (templateId != null) {
            try {
                var templateOpt = taskTemplateRepository.findById(templateId);
                if (templateOpt.isPresent()) {
                    TaskTemplate template = templateOpt.get();
                    String configJson = template.getConfigJson();
                    if (configJson != null && !configJson.isBlank()) {
                        List<EvaluationTask> templateTasks = createTemplateBasedTasks(plan, configJson);
                        if (!templateTasks.isEmpty()) {
                            log.info("#464: Template-driven splitting for plan {} (templateId={}), {} tasks",
                                     plan.getPlanNo(), templateId, templateTasks.size());
                            tasks.addAll(templateTasks);
                            return applySelectedItemsFilterAndSave(plan, tasks);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("#464: Template-driven splitting failed for plan {}, falling back to preset: {}",
                         plan.getPlanNo(), e.getMessage());
            }
        }

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

        return applySelectedItemsFilterAndSave(plan, tasks);
    }

    // ============ #464: 模板驱动拆分 ============

    /**
     * Create tasks based on template configJson content.
     * Reads operators, models, and training arrays from configJson.
     */
    private List<EvaluationTask> createTemplateBasedTasks(EvaluationPlan plan, String configJson) {
        List<EvaluationTask> tasks = new ArrayList<>();

        List<String> operators = extractStringArray(configJson, "operators");
        List<String> models = extractStringArray(configJson, "models");
        List<String> training = extractStringArray(configJson, "training");

        // Only use template-driven if at least one list is non-empty
        if (operators.isEmpty() && models.isEmpty() && training.isEmpty()) {
            return tasks;
        }

        // Create OPERATOR tasks
        for (String op : operators) {
            String config = String.format("{\"dtype\":\"FP32\",\"shape\":\"Medium\",\"operator\":\"%s\"}", op);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.OPERATOR, op, config));
        }

        // Create MODEL tasks
        for (String model : models) {
            String config = String.format("{\"model\":\"%s\",\"batchSize\":1}", model);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.MODEL, model, config));
        }

        // #465: Create TRAINING tasks
        for (String item : training) {
            String config = String.format("{\"training\":\"%s\",\"mode\":\"train\"}", item);
            tasks.add(createTask(plan, EvaluationTask.TestSubject.TRAINING, item, config));
        }

        log.info("#464: Template-based tasks: {} operators, {} models, {} training",
                 operators.size(), models.size(), training.size());
        return tasks;
    }

    /**
     * Extract templateId from evalConfig JSON string.
     */
    private Long extractTemplateId(String evalConfig) {
        if (evalConfig == null || evalConfig.isBlank()) return null;
        // Look for "templateId":123 or "templateId":"123"
        int idx = evalConfig.indexOf("\"templateId\"");
        if (idx < 0) return null;
        int colonIdx = evalConfig.indexOf(':', idx);
        if (colonIdx < 0) return null;
        // Skip whitespace and optional quotes
        int pos = colonIdx + 1;
        while (pos < evalConfig.length() && (evalConfig.charAt(pos) == ' ' || evalConfig.charAt(pos) == '"')) pos++;
        StringBuilder numBuf = new StringBuilder();
        while (pos < evalConfig.length() && Character.isDigit(evalConfig.charAt(pos))) {
            numBuf.append(evalConfig.charAt(pos));
            pos++;
        }
        if (numBuf.length() == 0) return null;
        try {
            return Long.parseLong(numBuf.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Extract a JSON string array from a JSON object string.
     * E.g., from {"operators": ["MatMul", "Conv2D"]} extracts ["MatMul", "Conv2D"]
     */
    private List<String> extractStringArray(String json, String fieldName) {
        List<String> result = new ArrayList<>();
        if (json == null) return result;
        String key = "\"" + fieldName + "\"";
        int idx = json.indexOf(key);
        if (idx < 0) return result;
        int bracketStart = json.indexOf('[', idx);
        if (bracketStart < 0) return result;
        int bracketEnd = json.indexOf(']', bracketStart);
        if (bracketEnd < 0) return result;
        String arrayStr = json.substring(bracketStart + 1, bracketEnd);
        if (arrayStr.isBlank()) return result;
        int pos = 0;
        while (pos < arrayStr.length()) {
            int q1 = arrayStr.indexOf('"', pos);
            if (q1 < 0) break;
            int q2 = arrayStr.indexOf('"', q1 + 1);
            if (q2 < 0) break;
            result.add(arrayStr.substring(q1 + 1, q2));
            pos = q2 + 1;
        }
        return result;
    }

    // ============ selectedItems 过滤 + 保存 ============

    /**
     * #412/#464: Apply selectedItems filter and save tasks
     */
    private List<EvaluationTask> applySelectedItemsFilterAndSave(EvaluationPlan plan, List<EvaluationTask> tasks) {
        List<String> selectedItems = extractSelectedItems(plan.getEvalConfig());
        if (selectedItems != null && !selectedItems.isEmpty()) {
            int beforeCount = tasks.size();

            // Check for "root" items — these mean "select ALL items of that category"
            boolean hasOpRoot = selectedItems.stream().anyMatch(si -> si.startsWith("op-root-"));
            boolean hasModelRoot = selectedItems.stream().anyMatch(si -> si.startsWith("model-root-"));
            boolean hasTrainingRoot = selectedItems.stream().anyMatch(si -> si.startsWith("training-root-"));

            tasks = tasks.stream()
                .filter(t -> {
                    String testItem = t.getTestItem();
                    String subject = t.getTestSubject().name().toLowerCase();
                    boolean isOperator = subject.equals("operator");
                    boolean isModel = subject.equals("model");
                    boolean isTraining = subject.equals("training");

                    // If root item exists for this category, keep all tasks of that category
                    if (isOperator && hasOpRoot) return true;
                    if (isModel && hasModelRoot) return true;
                    if (isTraining && hasTrainingRoot) return true;

                    return selectedItems.stream().anyMatch(si -> {
                        int firstDash = si.indexOf('-');
                        if (firstDash < 0) return false;
                        String prefix = si.substring(0, firstDash);
                        // Skip root items in per-item matching
                        if (si.contains("-root-")) return false;

                        // Extract item name: everything between first dash and last dash
                        int lastDash = si.lastIndexOf('-');
                        if (lastDash <= firstDash) return false;
                        String itemName = si.substring(firstDash + 1, lastDash);

                        boolean prefixMatch = (prefix.equals("op") && isOperator)
                            || (prefix.equals("model") && isModel)
                            || (prefix.equals("training") && isTraining);

                        // testItem may have suffix like "MLP-Medium/batch=4", match base name
                        String baseTestItem = testItem.contains("/") ? testItem.substring(0, testItem.indexOf('/')) : testItem;
                        return prefixMatch && baseTestItem.equals(itemName);
                    });
                })
                .collect(Collectors.toList());

            log.info("#412: selectedItems filter applied: {} -> {} tasks (selectedItems={})",
                     beforeCount, tasks.size(), selectedItems);
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

    /**
     * #412: Extract selectedItems array from evalConfig JSON string.
     * Format: {"selectedItems": ["op-MatMul-1", "model-MLP-Small-18", "op-root-0", ...]}
     */
    private List<String> extractSelectedItems(String evalConfig) {
        if (evalConfig == null || evalConfig.isBlank()) {
            return null;
        }
        int idx = evalConfig.indexOf("\"selectedItems\"");
        if (idx < 0) {
            return null;
        }
        int bracketStart = evalConfig.indexOf('[', idx);
        if (bracketStart < 0) {
            return null;
        }
        int bracketEnd = evalConfig.indexOf(']', bracketStart);
        if (bracketEnd < 0) {
            return null;
        }
        String arrayStr = evalConfig.substring(bracketStart + 1, bracketEnd);
        if (arrayStr.isBlank()) {
            return null;
        }
        List<String> items = new ArrayList<>();
        // Simple JSON array parser for string values
        int pos = 0;
        while (pos < arrayStr.length()) {
            int q1 = arrayStr.indexOf('"', pos);
            if (q1 < 0) break;
            int q2 = arrayStr.indexOf('"', q1 + 1);
            if (q2 < 0) break;
            items.add(arrayStr.substring(q1 + 1, q2));
            pos = q2 + 1;
        }
        return items.isEmpty() ? null : items;
    }

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
        // #465: Set evalType based on subject including TRAINING
        if (subject == EvaluationTask.TestSubject.OPERATOR) {
            task.setEvalType(EvaluationTask.EvalType.OPERATOR);
        } else if (subject == EvaluationTask.TestSubject.MODEL) {
            task.setEvalType(EvaluationTask.EvalType.MODEL);
        } else if (subject == EvaluationTask.TestSubject.TRAINING) {
            task.setEvalType(EvaluationTask.EvalType.TRAINING);
        } else {
            task.setEvalType(EvaluationTask.EvalType.GENERAL);
        }
        task.setEvalConfig(config);
        task.setStatus(EvaluationTask.TaskStatus.PENDING);
        task.setPriority(EvaluationTask.Priority.MEDIUM);
        task.setProgress(0);
        task.setCreatedBy(plan.getCreatedBy());
        task.setDimension(classifyDimension(testItem));
        // #485: Smart GPU allocation by evalType
        // OPERATOR tasks always use single GPU (gpu-1), regardless of plan RunSpec
        // MODEL/TRAINING tasks use plan's RunSpec (supports multi-GPU)
        if (plan.getRunSpecId() != null) {
            if (subject == EvaluationTask.TestSubject.OPERATOR) {
                // Operator benchmarks measure single-op on single-GPU; multi-GPU is meaningless
                runSpecRepository.findByCode("gpu-1").ifPresent(gpuOneSpec -> {
                    task.setRunSpecId(gpuOneSpec.getId());
                    task.setRunSpecCode(gpuOneSpec.getCode());
                });
                // Fallback: if gpu-1 RunSpec not found, use plan's RunSpec (backward compat)
                if (task.getRunSpecId() == null) {
                    task.setRunSpecId(plan.getRunSpecId());
                    try {
                        runSpecRepository.findById(plan.getRunSpecId()).ifPresent(spec -> {
                            task.setRunSpecCode(spec.getCode());
                        });
                    } catch (Exception ignored) {}
                }
            } else {
                // MODEL and TRAINING tasks inherit the plan's multi-GPU RunSpec
                task.setRunSpecId(plan.getRunSpecId());
                try {
                    runSpecRepository.findById(plan.getRunSpecId()).ifPresent(spec -> {
                        task.setRunSpecCode(spec.getCode());
                    });
                } catch (Exception ignored) {
                    // Fallback: just set the ID, code can be resolved later
                }
            }
        }
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
