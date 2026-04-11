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
import java.util.List;
import java.util.ArrayList;
import java.util.stream.Collectors;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 报告独立入口 — GET /reports, GET /reports/{id}
 * 复用 ChipReportRepository，提供顶层 /reports 路由 (#319)
 */
@RestController
@RequestMapping("/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ChipReportRepository reportRepository;
    private final ObjectMapper objectMapper;

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


    /**
     * #377: Report comparison — supports both GET and POST
     */
    @GetMapping("/compare")
    @RequireRole(Role.VIEWER)
    public ApiResponse<Object> compareReportsGet(@RequestParam String ids) {
        return doCompare(ids);
    }

    @PostMapping("/compare")
    @RequireRole(Role.VIEWER)
    public ApiResponse<Object> compareReportsPost(@RequestBody(required = false) Map<String, Object> body) {
        if (body == null) {
            return ApiResponse.error(1001, "请提供报告ID列表");
        }
        // #377: Accept both "ids" and "reportIds" keys
        Object idsObj = body.get("ids");
        if (idsObj == null) idsObj = body.get("reportIds");
        if (idsObj == null) {
            return ApiResponse.error(1001, "请提供报告ID列表 (支持 ids 或 reportIds)");
        }
        String idsStr;
        if (idsObj instanceof List) {
            idsStr = ((List<?>) idsObj).stream().map(Object::toString).collect(Collectors.joining(","));
        } else {
            idsStr = idsObj.toString();
        }
        return doCompare(idsStr);
    }

    private ApiResponse<Object> doCompare(String ids) {
        try {
            List<Long> idList = java.util.Arrays.stream(ids.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(Long::parseLong)
                    .collect(Collectors.toList());

            if (idList.size() < 2 || idList.size() > 5) {
                return ApiResponse.error(1001, "请选择 2-5 个报告进行对比");
            }

            List<Map<String, Object>> reportData = new ArrayList<>();
            for (Long rid : idList) {
                ChipReport r = reportRepository.findById(rid).orElse(null);
                if (r == null) continue;

                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", r.getId());
                item.put("reportNo", r.getReportNo());
                item.put("createdAt", r.getCreatedAt() != null ? r.getCreatedAt().toString() : "");
                item.put("overallScore", r.getOverallScore());
                item.put("status", r.getStatus());

                Map<String, Object> dims = new LinkedHashMap<>();
                if (r.getDimensionScores() != null) {
                    try { dims = objectMapper.readValue(r.getDimensionScores(), Map.class); } catch (Exception ignored) {}
                }
                item.put("dimensions", dims);
                reportData.add(item);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("reports", reportData);
            return ApiResponse.ok(result);
        } catch (NumberFormatException e) {
            return ApiResponse.error(1001, "报告ID格式错误");
        } catch (Exception e) {
            return ApiResponse.error(1005, "对比失败: " + e.getMessage());
        }
    }

}
