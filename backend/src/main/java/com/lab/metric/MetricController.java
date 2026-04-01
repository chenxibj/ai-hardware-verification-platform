package com.lab.metric;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.stream.Collectors;

@RestController @RequiredArgsConstructor
public class MetricController {
    private final EvaluationMetricRepository metricRepo;
    private final EvaluationResultRepository resultRepo;

    // ===== 指标定义 =====
    @GetMapping("/metrics")
    public ResponseEntity<Map<String,Object>> listMetrics(@RequestParam(required=false) String category) {
        var metrics = category!=null ? metricRepo.findByCategory(category) : metricRepo.findAllByOrderBySortOrder();
        return ResponseEntity.ok(Map.of("code",0,"data",metrics));
    }

    @GetMapping("/metrics/key")
    public ResponseEntity<Map<String,Object>> keyMetrics() {
        return ResponseEntity.ok(Map.of("code",0,"data",metricRepo.findByIsKeyMetricTrueOrderBySortOrder()));
    }

    // ===== 评测结果 =====
    @GetMapping("/tasks/{taskId}/results")
    public ResponseEntity<Map<String,Object>> taskResults(@PathVariable Long taskId) {
        var results = resultRepo.findByTaskIdOrderByMetricKey(taskId);
        return ResponseEntity.ok(Map.of("code",0,"data",results));
    }

    @GetMapping("/results/compare")
    public ResponseEntity<Map<String,Object>> compare(@RequestParam List<Long> taskIds) {
        var results = resultRepo.findByTaskIds(taskIds);
        // Group by metric_key, each group has values per taskId
        var grouped = results.stream().collect(Collectors.groupingBy(EvaluationResult::getMetricKey));
        List<Map<String,Object>> comparison = new ArrayList<>();
        for(var entry : grouped.entrySet()) {
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("metricKey", entry.getKey());
            var metric = metricRepo.findByMetricKey(entry.getKey());
            metric.ifPresent(m -> { row.put("metricName", m.getMetricName()); row.put("unit", m.getUnit()); });
            Map<Long,Double> values = new LinkedHashMap<>();
            for(var r : entry.getValue()) values.put(r.getTaskId(), r.getMetricValue());
            row.put("values", values);
            comparison.add(row);
        }
        return ResponseEntity.ok(Map.of("code",0,"data",comparison));
    }

    @PostMapping("/tasks/{taskId}/results")
    public ResponseEntity<Map<String,Object>> saveResults(@PathVariable Long taskId, @RequestBody List<Map<String,Object>> results) {
        List<EvaluationResult> saved = new ArrayList<>();
        for(var r : results) {
            EvaluationResult er = new EvaluationResult();
            er.setTaskId(taskId); er.setMetricKey((String)r.get("metricKey"));
            if(r.get("metricValue")!=null) er.setMetricValue(Double.valueOf(r.get("metricValue").toString()));
            er.setStringValue((String)r.get("stringValue")); er.setConfigLabel((String)r.get("configLabel"));
            saved.add(resultRepo.save(er));
        }
        return ResponseEntity.ok(Map.of("code",0,"data",saved));
    }
}
