package com.lab.template;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import org.hibernate.Hibernate;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 评测模板控制器
 * #161 - 评测模板浏览与管理
 * #409 - 评测脚本公开可查
 * #410 - 模板版本管理
 */
@Slf4j
@RestController
@RequestMapping("/templates")
@RequiredArgsConstructor
public class TemplateController {

    private final TaskTemplateRepository templateRepository;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    /* ── 脚本类型映射 ── */
    private static final Map<String, String[]> SCRIPT_MAP = new LinkedHashMap<>();
    static {
        SCRIPT_MAP.put("OPERATOR", new String[]{"operator_benchmark.py", "算子性能评测脚本"});
        SCRIPT_MAP.put("MODEL",    new String[]{"model_inference.py",      "模型推理评测脚本"});
        SCRIPT_MAP.put("TRAINING", new String[]{"model_training_benchmark.py", "模型训练评测脚本"});
    }

    /**
     * 校验 configJson 中的 batchSizes 字段
     */
    private String validateBatchSizes(String configJson) {
        if (configJson == null || configJson.isBlank()) return null;
        try {
            JsonNode root = objectMapper.readTree(configJson);
            JsonNode batchSizes = root.get("batchSizes");
            if (batchSizes != null && batchSizes.isArray()) {
                if (batchSizes.size() > 8) return "batchSizes 最多 8 个值";
                for (JsonNode bs : batchSizes) {
                    if (bs.isNumber() && bs.intValue() > 256) return "batchSizes 每个值不能超过 256";
                }
            }
        } catch (Exception e) { /* ignore */ }
        return null;
    }

    /* ══════════════════════════════════════════════════════
     *  CRUD
     * ══════════════════════════════════════════════════════ */

    @GetMapping
    public ResponseEntity<ApiResponse<List<TaskTemplate>>> listTemplates(
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String evalType) {
        List<TaskTemplate> templates = templateRepository.findAll();
        if (level != null && !level.isBlank())
            templates = templates.stream().filter(t -> level.equalsIgnoreCase(t.getEvaluationLayer())).collect(Collectors.toList());
        if (evalType != null && !evalType.isBlank())
            templates = templates.stream().filter(t -> evalType.equalsIgnoreCase(t.getEvalType())).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(templates));
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<TaskTemplate>> getTemplate(@PathVariable Long id) {
        TaskTemplate template = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));
        Hibernate.initialize(template.getMetrics());
        return ResponseEntity.ok(ApiResponse.ok(template));
    }

    @PostMapping("/{id}/clone")
    public ResponseEntity<ApiResponse<TaskTemplate>> cloneTemplate(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
        TaskTemplate source = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));

        String baseName = source.getName().replaceAll(" \\(副本.*\\)$", "");
        long copyCount = templateRepository.countByNameStartingWith(baseName + " (副本");
        String newName = copyCount == 0 ? baseName + " (副本)" : baseName + " (副本 " + (copyCount + 1) + ")";

        TaskTemplate clone = new TaskTemplate();
        clone.setName(newName);
        clone.setDescription(source.getDescription());
        clone.setEvalType(source.getEvalType());
        clone.setConfigJson(source.getConfigJson());
        clone.setEvaluationLayer(source.getEvaluationLayer());
        // #410: Fork 时版本从 1.0 重新开始
        clone.setVersion("1.0");
        clone.setVersionNotes("从「" + source.getName() + "」(v" + source.getVersion() + ") 克隆");
        clone.setChangelog(buildInitialChangelog("从「" + source.getName() + "」克隆而来"));
        clone.setIsSystem(false);
        clone.setForkFrom(source.getId());
        clone.setCreatedBy(userId);

        TaskTemplate saved = templateRepository.save(clone);
        log.info("Cloned template: {} -> {} (id={})", source.getName(), saved.getName(), saved.getId());
        return ResponseEntity.ok(ApiResponse.ok(saved));
    }

    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<TaskTemplate>> createTemplate(
            @RequestBody TaskTemplate template,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
        if (template.getConfigJson() != null && !template.getConfigJson().isBlank()) {
            try { objectMapper.readTree(template.getConfigJson()); }
            catch (Exception e) { return ResponseEntity.ok(ApiResponse.error("PARAM_INVALID", "configJson 不是有效的 JSON 格式")); }
            String batchError = validateBatchSizes(template.getConfigJson());
            if (batchError != null) return ResponseEntity.ok(ApiResponse.error("PARAM_INVALID", batchError));
        } else {
            template.setConfigJson("{}");
        }
        template.setId(null);
        template.setIsSystem(false);
        template.setCreatedBy(userId);
        // #410: 新建模板版本 1.0
        template.setVersion("1.0");
        template.setChangelog(buildInitialChangelog("初始版本"));
        TaskTemplate saved = templateRepository.save(template);
        log.info("Created custom template: {} (id={})", saved.getName(), saved.getId());
        return ResponseEntity.ok(ApiResponse.ok(saved));
    }

    @PutMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<TaskTemplate>> updateTemplate(
            @PathVariable Long id,
            @RequestBody TaskTemplate update) {
        TaskTemplate existing = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));
        if (Boolean.TRUE.equals(existing.getIsSystem()))
            throw new BusinessException(ErrorCode.FORBIDDEN, "系统模板不可编辑");

        if (update.getConfigJson() != null) {
            String batchError = validateBatchSizes(update.getConfigJson());
            if (batchError != null) return ResponseEntity.ok(ApiResponse.error("PARAM_INVALID", batchError));
        }

        if (update.getName() != null) existing.setName(update.getName());
        if (update.getDescription() != null) existing.setDescription(update.getDescription());
        if (update.getEvalType() != null) existing.setEvalType(update.getEvalType());
        if (update.getConfigJson() != null) existing.setConfigJson(update.getConfigJson());
        if (update.getEvaluationLayer() != null) existing.setEvaluationLayer(update.getEvaluationLayer());

        // #410: 自动递增 minor 版本号，changelog 追加记录
        String oldVersion = existing.getVersion() != null ? existing.getVersion() : "1.0";
        String newVersion = incrementMinorVersion(oldVersion);
        existing.setVersion(newVersion);

        String changeNote = update.getVersionNotes();
        if (changeNote == null || changeNote.isBlank()) changeNote = "更新模板配置";
        existing.setVersionNotes(changeNote);
        existing.setChangelog(appendChangelog(existing.getChangelog(), newVersion, changeNote));

        TaskTemplate saved = templateRepository.save(existing);
        log.info("Updated template: {} (id={}) v{} -> v{}", saved.getName(), saved.getId(), oldVersion, newVersion);
        return ResponseEntity.ok(ApiResponse.ok(saved));
    }

    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<Void>> deleteTemplate(@PathVariable Long id) {
        TaskTemplate existing = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));
        if (Boolean.TRUE.equals(existing.getIsSystem()))
            throw new BusinessException(ErrorCode.FORBIDDEN, "系统模板不可删除");
        templateRepository.deleteById(id);
        log.info("Deleted template: {} (id={})", existing.getName(), id);
        return ResponseEntity.ok(ApiResponse.ok());
    }

    /* ══════════════════════════════════════════════════════
     *  #409: 获取模板关联的评测脚本内容
     * ══════════════════════════════════════════════════════ */
    @GetMapping("/{id}/scripts")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTemplateScripts(@PathVariable Long id) {
        TaskTemplate template = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));

        String configJson = template.getConfigJson();
        List<Map<String, String>> scripts = new ArrayList<>();

        try {
            Map<String, Object> config = objectMapper.readValue(configJson,
                    new TypeReference<Map<String, Object>>() {});

            // 根据 configJson 里的内容确定关联的脚本
            if (config.containsKey("operators")) {
                addScript(scripts, "OPERATOR", "operator_benchmark.py", "算子性能评测脚本");
            }
            if (config.containsKey("models") || config.containsKey("huggingface_models")) {
                addScript(scripts, "MODEL", "model_inference.py", "模型推理评测脚本");
            }
            if (config.containsKey("training")) {
                addScript(scripts, "TRAINING", "model_training_benchmark.py", "模型训练评测脚本");
            }

            // 如果没有匹配到，根据 evalType / evaluationLayer 推断
            if (scripts.isEmpty()) {
                String layer = template.getEvaluationLayer();
                if ("OPERATOR".equals(layer)) {
                    addScript(scripts, "OPERATOR", "operator_benchmark.py", "算子性能评测脚本");
                } else if ("MODEL".equals(layer)) {
                    addScript(scripts, "MODEL", "model_inference.py", "模型推理评测脚本");
                } else {
                    // 芯片级/对比级: 返回所有脚本
                    for (Map.Entry<String, String[]> entry : SCRIPT_MAP.entrySet()) {
                        addScript(scripts, entry.getKey(), entry.getValue()[0], entry.getValue()[1]);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse template config for scripts: {}", e.getMessage());
            // 返回所有脚本
            for (Map.Entry<String, String[]> entry : SCRIPT_MAP.entrySet()) {
                addScript(scripts, entry.getKey(), entry.getValue()[0], entry.getValue()[1]);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("templateId", id);
        result.put("templateName", template.getName());
        result.put("scripts", scripts);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    private void addScript(List<Map<String, String>> scripts, String taskType, String filename, String description) {
        Map<String, String> script = new LinkedHashMap<>();
        script.put("name", description);
        script.put("taskType", taskType);
        script.put("language", "python");
        script.put("filename", filename);

        // 尝试多个路径
        String content = null;
        String[] searchPaths = {
            "eval-scripts/" + filename,
            "/app/eval-scripts/" + filename,
            "/root/ai-hardware-verification-platform/eval-scripts/" + filename,
        };
        for (String p : searchPaths) {
            try {
                Path path = Paths.get(p);
                if (Files.exists(path)) {
                    content = Files.readString(path);
                    break;
                }
            } catch (Exception e) { /* continue */ }
        }

        script.put("content", content != null ? content : "# 脚本文件 " + filename + " 暂未部署到服务器");
        scripts.add(script);
    }

    /* ══════════════════════════════════════════════════════
     *  #410: 获取模板变更日志
     * ══════════════════════════════════════════════════════ */
    @GetMapping("/{id}/changelog")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTemplateChangelog(@PathVariable Long id) {
        TaskTemplate template = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("templateId", id);
        result.put("templateName", template.getName());
        result.put("currentVersion", template.getVersion());
        result.put("versionNotes", template.getVersionNotes());

        List<Map<String, Object>> entries = new ArrayList<>();
        if (template.getChangelog() != null && !template.getChangelog().isBlank()) {
            try {
                entries = objectMapper.readValue(template.getChangelog(),
                        new TypeReference<List<Map<String, Object>>>() {});
            } catch (Exception e) {
                log.warn("Failed to parse changelog for template {}: {}", id, e.getMessage());
            }
        }
        result.put("changelog", entries);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    /* ── 版本管理辅助方法 ── */

    private String incrementMinorVersion(String version) {
        try {
            String[] parts = version.split("\\.");
            int major = Integer.parseInt(parts[0]);
            int minor = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            return major + "." + (minor + 1);
        } catch (Exception e) {
            return "1.1";
        }
    }

    private String buildInitialChangelog(String note) {
        try {
            List<Map<String, Object>> entries = new ArrayList<>();
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("version", "1.0");
            entry.put("date", LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE));
            entry.put("changes", List.of(note));
            entries.add(entry);
            return objectMapper.writeValueAsString(entries);
        } catch (Exception e) {
            return "[]";
        }
    }

    private String appendChangelog(String existingChangelog, String newVersion, String changeNote) {
        try {
            List<Map<String, Object>> entries = new ArrayList<>();
            if (existingChangelog != null && !existingChangelog.isBlank()) {
                entries = objectMapper.readValue(existingChangelog,
                        new TypeReference<List<Map<String, Object>>>() {});
            }
            // 新版本放在最前面
            Map<String, Object> newEntry = new LinkedHashMap<>();
            newEntry.put("version", newVersion);
            newEntry.put("date", LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE));
            newEntry.put("changes", List.of(changeNote));
            entries.add(0, newEntry);
            return objectMapper.writeValueAsString(entries);
        } catch (Exception e) {
            return existingChangelog;
        }
    }
}
