package com.lab.comparison;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/comparisons") @RequiredArgsConstructor
public class ComparisonController {
    private final ComparisonRepository comparisonRepository;

    @PostMapping
    public ResponseEntity<Map<String,Object>> create(@RequestBody Map<String,Object> body, @AuthenticationPrincipal User user) {
        ComparisonRecord r = new ComparisonRecord();
        r.setComparisonNo("CMP-" + Instant.now().getEpochSecond() + "-" + String.format("%03d",(int)(Math.random()*1000)));
        r.setTitle((String)body.get("title")); r.setDescription((String)body.get("description"));
        r.setReportIds(body.get("reportIds")!=null?body.get("reportIds").toString():null);
        r.setCompareType((String)body.getOrDefault("compareType","REPORT"));
        r.setComparisonResult(body.get("comparisonResult")!=null?body.get("comparisonResult").toString():null);
        r.setCreatedBy(user.getId());
        return ResponseEntity.ok(Map.of("code",0,"data",comparisonRepository.save(r)));
    }

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        Page<ComparisonRecord> records = comparisonRepository.findAll(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC,"createdAt")));
        Map<String,Object> res = new HashMap<>();
        res.put("code",0); res.put("data",records.getContent()); res.put("total",records.getTotalElements());
        return ResponseEntity.ok(res);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> get(@PathVariable Long id) {
        return comparisonRepository.findById(id).map(r->ResponseEntity.ok(Map.<String,Object>of("code",0,"data",r))).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String,Object>> delete(@PathVariable Long id) {
        comparisonRepository.deleteById(id); return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }
}
