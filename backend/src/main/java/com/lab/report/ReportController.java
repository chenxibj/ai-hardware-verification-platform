package com.lab.report;

import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@RestController @RequestMapping("/reports") @RequiredArgsConstructor
public class ReportController {
    private final ReportRepository reportRepository;

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body, @AuthenticationPrincipal User user) {
        EvaluationReport r = new EvaluationReport();
        r.setReportNo("RPT-" + Instant.now().getEpochSecond() + "-" + String.format("%03d",(int)(Math.random()*1000)));
        r.setTitle((String)body.get("title"));
        r.setSummary((String)body.get("summary"));
        r.setEvalType((String)body.getOrDefault("evalType","GENERAL"));
        r.setStatus("DRAFT");
        r.setMetrics(body.get("metrics")!=null?body.get("metrics").toString():"{}");
        r.setCreatedBy(user.getId());
        if(body.get("taskId")!=null) r.setTaskId(Long.valueOf(body.get("taskId").toString()));
        return ResponseEntity.ok(Map.of("code",0,"data",reportRepository.save(r)));
    }

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@RequestParam(required=false) String status, @RequestParam(required=false) String keyword,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<EvaluationReport> reports;
        if (status!=null) reports = reportRepository.findByStatus(status, pageable);
        else if (keyword!=null) reports = reportRepository.findByTitleContaining(keyword, pageable);
        else reports = reportRepository.findAll(pageable);
        Map<String,Object> res = new HashMap<>();
        res.put("code",0); res.put("data",reports.getContent()); res.put("total",reports.getTotalElements());
        return ResponseEntity.ok(res);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> get(@PathVariable Long id) {
        return reportRepository.findById(id).map(r->ResponseEntity.ok(Map.<String,Object>of("code",0,"data",r))).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/score")
    public ResponseEntity<Map<String,Object>> updateScore(@PathVariable Long id, @RequestBody Map<String,Object> body) {
        EvaluationReport r = reportRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        if(body.containsKey("score")) r.setScore(Double.parseDouble(body.get("score").toString()));
        if(body.containsKey("summary")) r.setSummary((String)body.get("summary"));
        return ResponseEntity.ok(Map.of("code",0,"data",reportRepository.save(r)));
    }

    @PostMapping("/{id}/submit")
    public ResponseEntity<Map<String,Object>> submit(@PathVariable Long id) {
        EvaluationReport r = reportRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        r.setStatus("REVIEWING"); return ResponseEntity.ok(Map.of("code",0,"data",reportRepository.save(r)));
    }

    @PostMapping("/{id}/publish")
    public ResponseEntity<Map<String,Object>> publish(@PathVariable Long id, @AuthenticationPrincipal User user) {
        EvaluationReport r = reportRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        r.setStatus("PUBLISHED"); r.setReviewedBy(user.getId()); r.setPublishedAt(Instant.now());
        return ResponseEntity.ok(Map.of("code",0,"data",reportRepository.save(r)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String,Object>> delete(@PathVariable Long id) {
        reportRepository.deleteById(id); return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String,Object>> stats() {
        return ResponseEntity.ok(Map.of("code",0,"data",Map.of(
            "total", reportRepository.count(),
            "draft", reportRepository.countByStatus("DRAFT"),
            "reviewing", reportRepository.countByStatus("REVIEWING"),
            "published", reportRepository.countByStatus("PUBLISHED"),
            "avgScore", reportRepository.findAll().stream().filter(r->r.getScore()!=null).mapToDouble(EvaluationReport::getScore).average().orElse(0)
        )));
    }
}
