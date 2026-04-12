package com.lab.template;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import org.hibernate.Hibernate;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 评测模板控制器
 * #161 - 评测模板浏览与管理
 */
@Slf4j
@RestController
@RequestMapping("/templates")
@RequiredArgsConstructor
public class TemplateController {

    private final TaskTemplateRepository templateRepository;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 校验 configJson 中的 batchSizes 字段
     * - 数组最多 8 个值
     * - 每个值 <= 256
     */
    private String validateBatchSizes(String configJson) {
        if (configJson == null || configJson.isBlank()) return null;
        try {
            JsonNode root = objectMapper.readTree(configJson);
            JsonNode batchSizes = root.get("batchSizes");
            if (batchSizes != null && batchSizes.isArray()) {
                if (batchSizes.size() > 8) {
                    return "batchSizes 最多 8 个值";
                }
                for (JsonNode bs : batchSizes) {
                    if (bs.isNumber() && bs.intValue() > 256) {
                        return "batchSizes 每个值不能超过 256";
                    }
                }
            }
        } catch (Exception e) {
            // JSON parse errors handled elsewhere
        }
        return null;
    }

    /**
     * GET /api/templates — 列表（支持 level/evalType 筛选）
     * 返回完整的 configJson 和 isSystem 标识
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<TaskTemplate>>> listTemplates(
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String evalType) {
        List<TaskTemplate> templates = templateRepository.findAll();

        if (level != null && !level.isBlank()) {
            templates = templates.stream()
                    .filter(t -> level.equalsIgnoreCase(t.getEvaluationLayer()))
                    .collect(Collectors.toList());
        }
        if (evalType != null && !evalType.isBlank()) {
            templates = templates.stream()
                    .filter(t -> evalType.equalsIgnoreCase(t.getEvalType()))
                    .collect(Collectors.toList());
        }

        return ResponseEntity.ok(ApiResponse.ok(templates));
    }

    /**
     * GET /api/templates/{id} — 详情（返回完整 configJson + 关联指标）
     * #325: 初始化 metrics 关联
     */
    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<TaskTemplate>> getTemplate(@PathVariable Long id) {
        TaskTemplate template = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));
        Hibernate.initialize(template.getMetrics());
        return ResponseEntity.ok(ApiResponse.ok(template));
    }

    /**
     * POST /api/templates/{id}/clone — 克隆模板
     * 复制模板所有配置，is_system=false，forkFrom 指向原模板 id
     * 智能命名去重：第一次 "xxx (副本)"，之后 "xxx (副本 2)", "xxx (副本 3)"...
     * 无需 ENGINEER 权限，任何登录用户都能克隆
     */
    @PostMapping("/{id}/clone")
    public ResponseEntity<ApiResponse<TaskTemplate>> cloneTemplate(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;

        TaskTemplate source = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));

        // 智能命名：检查已有副本数量
        String baseName = source.getName().replaceAll(" \\(副本.*\\)$", "");
        long copyCount = templateRepository.countByNameStartingWith(baseName + " (副本");
        String newName;
        if (copyCount == 0) {
            newName = baseName + " (副本)";
        } else {
            newName = baseName + " (副本 " + (copyCount + 1) + ")";
        }

        TaskTemplate clone = new TaskTemplate();
        clone.setName(newName);
        clone.setDescription(source.getDescription());
        clone.setEvalType(source.getEvalType());
        clone.setConfigJson(source.getConfigJson());
        clone.setEvaluationLayer(source.getEvaluationLayer());
        clone.setVersion(source.getVersion());
        clone.setIsSystem(false);
        clone.setForkFrom(source.getId());
        clone.setCreatedBy(userId);

        TaskTemplate saved = templateRepository.save(clone);
        log.info("Cloned template: {} -> {} (id={})", source.getName(), saved.getName(), saved.getId());
        return ResponseEntity.ok(ApiResponse.ok(saved));
    }

    /**
     * POST /api/templates — 创建自定义模板（需 ENGINEER+）
     */
    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<TaskTemplate>> createTemplate(
            @RequestBody TaskTemplate template,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
        // 校验 configJson
        if (template.getConfigJson() != null && !template.getConfigJson().isBlank()) {
            try {
                objectMapper.readTree(template.getConfigJson());
            } catch (Exception e) {
                return ResponseEntity.ok(ApiResponse.error("PARAM_INVALID", "configJson 不是有效的 JSON 格式"));
            }
            // 校验 batchSizes
            String batchError = validateBatchSizes(template.getConfigJson());
            if (batchError != null) {
                return ResponseEntity.ok(ApiResponse.error("PARAM_INVALID", batchError));
            }
        } else {
            template.setConfigJson("{}");
        }
        template.setId(null);
        template.setIsSystem(false);
        template.setCreatedBy(userId);
        TaskTemplate saved = templateRepository.save(template);
        log.info("Created custom template: {} (id={})", saved.getName(), saved.getId());
        return ResponseEntity.ok(ApiResponse.ok(saved));
    }

    /**
     * PUT /api/templates/{id} — 更新（仅自定义模板可编辑）
     */
    @PutMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<TaskTemplate>> updateTemplate(
            @PathVariable Long id,
            @RequestBody TaskTemplate update) {
        TaskTemplate existing = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));

        if (Boolean.TRUE.equals(existing.getIsSystem())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "系统模板不可编辑");
        }

        // 校验 batchSizes
        if (update.getConfigJson() != null) {
            String batchError = validateBatchSizes(update.getConfigJson());
            if (batchError != null) {
                return ResponseEntity.ok(ApiResponse.error("PARAM_INVALID", batchError));
            }
        }

        if (update.getName() != null) existing.setName(update.getName());
        if (update.getDescription() != null) existing.setDescription(update.getDescription());
        if (update.getEvalType() != null) existing.setEvalType(update.getEvalType());
        if (update.getConfigJson() != null) existing.setConfigJson(update.getConfigJson());
        if (update.getEvaluationLayer() != null) existing.setEvaluationLayer(update.getEvaluationLayer());

        TaskTemplate saved = templateRepository.save(existing);
        log.info("Updated template: {} (id={})", saved.getName(), saved.getId());
        return ResponseEntity.ok(ApiResponse.ok(saved));
    }

    /**
     * DELETE /api/templates/{id} — 删除（仅自定义模板）
     */
    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<Void>> deleteTemplate(@PathVariable Long id) {
        TaskTemplate existing = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));

        if (Boolean.TRUE.equals(existing.getIsSystem())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "系统模板不可删除");
        }

        templateRepository.deleteById(id);
        log.info("Deleted template: {} (id={})", existing.getName(), id);
        return ResponseEntity.ok(ApiResponse.ok());
    }


    /**
     * #409: 获取模板关联的评测脚本内容（公开透明）
     */
    @GetMapping("/{id}/scripts")
    public ResponseEntity<Map<String, Object>> getTemplateScripts(@PathVariable Long id) {
        TaskTemplate template = templateRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Template not found: " + id));

        String configJson = template.getConfigJson();
        java.util.List<Map<String, String>> scripts = new java.util.ArrayList<>();

        // Script mapping based on task types in config
        java.util.Map<String, String> scriptFiles = new java.util.LinkedHashMap<>();
        scriptFiles.put("OPERATOR", "operator_benchmark.py");
        scriptFiles.put("MODEL", "model_inference.py");
        scriptFiles.put("TRAINING", "model_training_benchmark.py");

        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> config = mapper.readValue(configJson, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});

            if (config.containsKey("operators")) {
                scripts.add(readScriptFile("OPERATOR", "operator_benchmark.py", "算子性能评测脚本"));
            }
            if (config.containsKey("models")) {
                scripts.add(readScriptFile("MODEL", "model_inference.py", "模型推理评测脚本"));
            }
            if (config.containsKey("training")) {
                scripts.add(readScriptFile("TRAINING", "model_training_benchmark.py", "模型训练评测脚本"));
            }
        } catch (Exception e) {
            log.warn("Failed to parse template config: {}", e.getMessage());
        }

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("templateId", id);
        result.put("templateName", template.getName());
        result.put("scripts", scripts);
        return ResponseEntity.ok(Map.of("code", 0, "data", result));
    }

    private java.util.Map<String, String> readScriptFile(String type, String filename, String description) {
        Map<String, String> script = new java.util.HashMap<>();
        script.put("type", type);
        script.put("filename", filename);
        script.put("description", description);
        try {
            // Read from eval-scripts directory (classpath or filesystem)
            java.nio.file.Path scriptPath = java.nio.file.Paths.get("eval-scripts", filename);
            if (java.nio.file.Files.exists(scriptPath)) {
                script.put("content", java.nio.file.Files.readString(scriptPath));
            } else {
                // Try classpath
                script.put("content", "// 脚本文件 " + filename + " 暂未部署到服务器");
            }
        } catch (Exception e) {
            script.put("content", "// 读取脚本失败: " + e.getMessage());
        }
        return script;
    }

}