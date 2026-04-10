package com.lab.chip;

import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import com.lab.chipreport.ChipReport;
import com.lab.chipreport.ChipReportRepository;

import java.util.*;
import java.util.Optional;

/**
 * 芯片管理控制器（v3.2适配）
 */
@Slf4j
@RestController
@RequestMapping("/chips")
@RequiredArgsConstructor
public class ChipController {

    private final ChipService chipService;
    private final ChipReportRepository chipReportRepository;
    private final EvaluationTaskRepository taskRepository;
    private final EvaluationResultRepository resultRepository;

    /**
     * 预置厂商列表
     */
    private static final List<Map<String, String>> VENDORS = List.of(
            Map.of("id", "huawei", "name", "华为（昇腾）"),
            Map.of("id", "cambricon", "name", "寒武纪"),
            Map.of("id", "hygon", "name", "海光"),
            Map.of("id", "sensetime", "name", "商汤"),
            Map.of("id", "baidu", "name", "百度（昆仑芯）"),
            Map.of("id", "nvidia", "name", "NVIDIA"),
            Map.of("id", "amd", "name", "AMD"),
            Map.of("id", "intel", "name", "Intel"),
            Map.of("id", "biren", "name", "壁仞"),
            Map.of("id", "mthreads", "name", "摩尔线程"),
            Map.of("id", "iluvatar", "name", "天数智芯"),
            Map.of("id", "enflame", "name", "燧原科技"),
            Map.of("id", "corerain", "name", "鲲云科技"),
            Map.of("id", "tsingmicro", "name", "清微智能")
    );

    /**
     * 获取预置厂商列表
     */
    @GetMapping("/vendors")
    public ResponseEntity<Map<String, Object>> getVendors() {
        return ResponseEntity.ok(success(VENDORS));
    }

    /**
     * 创建芯片
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('super_admin', 'tenant_admin', 'engineer')")
    public ResponseEntity<Map<String, Object>> createChip(
            @RequestBody Chip chip,
            @AuthenticationPrincipal User user) {
        Long userId = user != null ? user.getId() : 1L;
        Chip created = chipService.createChip(chip, userId);
        return ResponseEntity.ok(success(created));
    }

    /**
     * 查询芯片列表（所有认证用户可查看）
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> listChips(
            @RequestParam(required = false) String chipType,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String vendor,
            @RequestParam(required = false) String name,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        // If name parameter is provided, use name search
        if (name != null && !name.isBlank()) {
            List<Chip> chips = chipService.searchByName(name);
            Map<String, Object> resp = success(chips);
            resp.put("total", chips.size());
            resp.put("page", page);
            resp.put("size", size);
            return ResponseEntity.ok(resp);
        }
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Chip.ChipType type = chipType != null ? Chip.ChipType.valueOf(chipType) : null;
        Chip.ChipStatus st = status != null ? Chip.ChipStatus.valueOf(status) : null;
        Page<Chip> chips = chipService.listChips(type, st, search, vendor, pageable);
        Map<String, Object> resp = success(chips.getContent());
        resp.put("total", chips.getTotalElements());
        resp.put("page", page);
        resp.put("size", size);
        return ResponseEntity.ok(resp);
    }

    /**
     * 查询芯片详情
     */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getChip(@PathVariable Long id) {
        try {
            Chip chip = chipService.getChip(id);
            return ResponseEntity.ok(success(chip));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * 更新芯片
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('super_admin', 'tenant_admin', 'engineer')")
    public ResponseEntity<Map<String, Object>> updateChip(
            @PathVariable Long id,
            @RequestBody Chip chip) {
        try {
            Chip updated = chipService.updateChip(id, chip);
            return ResponseEntity.ok(success(updated));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * 删除芯片（软删除→ARCHIVED）
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('super_admin', 'tenant_admin', 'engineer')")
    public ResponseEntity<Map<String, Object>> deleteChip(@PathVariable Long id) {
        try {
            chipService.softDeleteChip(id);
            return ResponseEntity.ok(success("deleted"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * 查询芯片的评测报告
     */
    @GetMapping("/{id}/reports")
    public ResponseEntity<Map<String, Object>> getChipReports(@PathVariable Long id) {
        List<ChipReport> reports = chipReportRepository.findByChipId(id);
        Map<String, Object> resp = success(reports);
        resp.put("total", reports.size());
        return ResponseEntity.ok(resp);
    }


    /**
     * GET /api/chips/{id}/timeline — 芯片评测历史时间线 (#326)
     */
    @GetMapping("/{id}/timeline")
    public ResponseEntity<Map<String, Object>> getChipTimeline(@PathVariable Long id) {
        // Verify chip exists
        chipService.getChip(id);

        List<EvaluationTask> tasks = taskRepository.findByChipId(id,
                PageRequest.of(0, 100, Sort.by(Sort.Direction.DESC, "createdAt"))).getContent();
        List<Map<String, Object>> timeline = new ArrayList<>();
        for (EvaluationTask task : tasks) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("date", task.getCreatedAt());
            entry.put("taskName", task.getName());
            entry.put("taskId", task.getId());
            entry.put("status", task.getStatus() != null ? task.getStatus().name() : null);
            // Try to get score from evaluation results
            Double score = null;
            try {
                Optional<EvaluationResult> result = resultRepository.findByTaskId(task.getId());
                if (result.isPresent() && result.get().getMetricsSummary() != null) {
                    com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                    @SuppressWarnings("unchecked")
                    Map<String, Object> summary = om.readValue(result.get().getMetricsSummary(), Map.class);
                    Object s = summary.get("overallScore");
                    if (s == null) s = summary.get("score");
                    if (s instanceof Number) score = ((Number) s).doubleValue();
                }
            } catch (Exception ignored) {}
            entry.put("score", score);
            entry.put("completedAt", task.getCompletedAt());
            timeline.add(entry);
        }
        Map<String, Object> resp = success(timeline);
        resp.put("total", timeline.size());
        return ResponseEntity.ok(resp);
    }

    private Map<String, Object> success(Object data) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", data);
        return resp;
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 1001);
        resp.put("message", message);
        return resp;
    }
}
