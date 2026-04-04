package com.lab.chip;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.common.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.lab.chipreport.ChipReport;
import com.lab.chipreport.ChipReportRepository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 芯片管理控制器
 * Enhanced: #159 — @Valid + DTO 参数校验
 */
@Slf4j
@RestController
@RequestMapping("/chips")
@RequiredArgsConstructor
public class ChipController {

    private final ChipService chipService;
    private final ChipReportRepository chipReportRepository;

    /**
     * 创建芯片 — 需要 ENGINEER 及以上
     * Enhanced: 使用 ChipCreateRequest DTO + @Valid 校验
     */
    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<Chip>> createChip(
            @Valid @RequestBody ChipCreateRequest request,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
        Chip created = chipService.createChip(request, userId);
        return ResponseEntity.ok(ApiResponse.ok(created));
    }

    /**
     * 查询芯片列表 — VIEWER 及以上
     */
    @GetMapping
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> listChips(
            @RequestParam(required = false) String chipType,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String name,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        if (name != null && !name.isBlank()) {
            List<Chip> chips = chipService.searchByName(name);
            return ResponseEntity.ok(buildListResponse(chips, chips.size(), page, size));
        }
        Pageable pageable = PageRequest.of(page, size);
        Chip.ChipType type = null;
        Chip.ChipStatus st = null;
        try {
            if (chipType != null) type = Chip.ChipType.valueOf(chipType);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "无效的芯片类型: " + chipType);
        }
        try {
            if (status != null) st = Chip.ChipStatus.valueOf(status);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "无效的芯片状态: " + status);
        }
        Page<Chip> chips = chipService.listChips(type, st, search, pageable);
        return ResponseEntity.ok(buildListResponse(chips.getContent(), chips.getTotalElements(), page, size));
    }

    /**
     * 查询芯片详情 — VIEWER 及以上
     */
    @GetMapping("/{id}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<ApiResponse<Chip>> getChip(@PathVariable Long id) {
        Chip chip = chipService.getChip(id);
        return ResponseEntity.ok(ApiResponse.ok(chip));
    }

    /**
     * 更新芯片 — 需要 ENGINEER 及以上
     */
    @PutMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<Chip>> updateChip(
            @PathVariable Long id,
            @RequestBody Chip chip) {
        Chip updated = chipService.updateChip(id, chip);
        return ResponseEntity.ok(ApiResponse.ok(updated));
    }

    /**
     * 删除芯片 — 需要 ENGINEER 及以上
     */
    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<Void>> deleteChip(@PathVariable Long id) {
        chipService.deleteChip(id);
        return ResponseEntity.ok(ApiResponse.ok());
    }

    /**
     * 查询芯片的评测报告 — VIEWER 及以上
     */
    @GetMapping("/{id}/reports")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getChipReports(@PathVariable Long id) {
        List<ChipReport> reports = chipReportRepository.findByChipId(id);
        return ResponseEntity.ok(buildListResponse(reports, reports.size(), 0, reports.size()));
    }

    private Map<String, Object> buildListResponse(Object data, long total, int page, int size) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", data);
        resp.put("total", total);
        resp.put("page", page);
        resp.put("size", size);
        resp.put("timestamp", System.currentTimeMillis());
        return resp;
    }
}
