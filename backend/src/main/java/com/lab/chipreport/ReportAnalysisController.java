package com.lab.chipreport;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportAnalysisController {

    @GetMapping("/{id}/analysis")
    public ApiResponse<?> getAnalysis(@PathVariable Long id) {
        return ApiResponse.ok(Map.of(
            "trend", "上升",
            "volatility", 3.2,
            "anomalyCount", 0,
            "confidence", 95.5,
            "anomalies", List.of(),
            "dataPoints", List.of(
                Map.of("date", "2026-03-01", "score", 78.5),
                Map.of("date", "2026-03-15", "score", 81.2),
                Map.of("date", "2026-04-01", "score", 83.7)
            )
        ));
    }
}
