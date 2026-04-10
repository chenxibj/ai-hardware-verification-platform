package com.lab.chipreport;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 报告独立入口 — GET /reports, GET /reports/{id}
 * 复用 ChipReportRepository，提供顶层 /reports 路由 (#319)
 */
@RestController
@RequestMapping("/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ChipReportRepository reportRepository;

    @GetMapping
    @RequireRole(Role.VIEWER)
    public ApiResponse<Object> listReports(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long chipId,
            @RequestParam(required = false) String status) {

        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));

        ChipReport.ReportStatus statusEnum = null;
        if (status != null && !status.isBlank()) {
            try { statusEnum = ChipReport.ReportStatus.valueOf(status); } catch (Exception ignored) {}
        }

        Page<ChipReport> result = reportRepository.findAll(
                ChipReportSpec.filtered(chipId, statusEnum, null, null, null), pageable);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("records", result.getContent());
        data.put("total", result.getTotalElements());
        data.put("page", page);
        data.put("size", size);
        return ApiResponse.ok(data);
    }

    @GetMapping("/{id}")
    @RequireRole(Role.VIEWER)
    public ApiResponse<ChipReport> getReport(@PathVariable Long id) {
        ChipReport report = reportRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Report not found: " + id));
        return ApiResponse.ok(report);
    }
}
