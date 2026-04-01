package com.lab.dataset;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/datasets") @RequiredArgsConstructor
public class DatasetController {
    private final DatasetRepository datasetRepo;

    @PostMapping
    public ResponseEntity<Map<String,Object>> create(@RequestBody Map<String,Object> body, @AuthenticationPrincipal User user) {
        Dataset d = new Dataset();
        d.setName((String)body.get("name")); d.setDescription((String)body.get("description"));
        d.setType((String)body.getOrDefault("type","TEXT")); d.setFormat((String)body.get("format"));
        if(body.get("sampleCount")!=null) d.setSampleCount(Integer.valueOf(body.get("sampleCount").toString()));
        d.setCreatedBy(user.getId());
        return ResponseEntity.ok(Map.of("code",0,"data",datasetRepo.save(d)));
    }

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@RequestParam(required=false) String type, @RequestParam(required=false) Boolean system,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Dataset> result;
        if(type!=null) result = datasetRepo.findByType(type, pageable);
        else if(system!=null) result = datasetRepo.findByIsSystem(system, pageable);
        else result = datasetRepo.findAll(pageable);
        return ResponseEntity.ok(Map.of("code",0,"data",result.getContent(),"total",result.getTotalElements()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> get(@PathVariable Long id) {
        return datasetRepo.findById(id).map(d -> ResponseEntity.ok(Map.<String,Object>of("code",0,"data",d)))
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String,Object>> delete(@PathVariable Long id) {
        datasetRepo.deleteById(id); return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }
}
