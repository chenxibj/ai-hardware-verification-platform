package com.lab.template;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
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

    /**
     * GET /api/templates — 列表（支持 level/evalType 筛选）
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
     * GET /api/templates/{id} — 详情
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TaskTemplate>> getTemplate(@PathVariable Long id) {
        TaskTemplate template = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + id));
        return ResponseEntity.ok(ApiResponse.ok(template));
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
        // 校验 configJson：非空时验证 JSON 格式，为空则设置默认值
        if (template.getConfigJson() != null && !template.getConfigJson().isBlank()) {
            try {
                // 验证是有效 JSON
                new com.fasterxml.jackson.databind.ObjectMapper().readTree(template.getConfigJson());
            } catch (Exception e) {
                return ResponseEntity.ok(ApiResponse.error("PARAM_INVALID", "configJson 不是有效的 JSON 格式"));
            }
        } else {
            // 设置默认空配置
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
}
