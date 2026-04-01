package com.lab.evalobject;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/eval-objects") @RequiredArgsConstructor
public class EvaluationObjectController {
    private final EvaluationObjectRepository objectRepo;
    private final EvaluationObjectVersionRepository versionRepo;

    @PostMapping
    public ResponseEntity<Map<String,Object>> create(@RequestBody Map<String,Object> body, @AuthenticationPrincipal User user) {
        EvaluationObject obj = new EvaluationObject();
        obj.setName((String)body.get("name")); obj.setType((String)body.get("type"));
        obj.setFramework((String)body.get("framework")); obj.setDescription((String)body.get("description"));
        if(body.get("metadata")!=null) obj.setMetadata(body.get("metadata").toString());
        obj.setCreatedBy(user.getId());
        return ResponseEntity.ok(Map.of("code",0,"data",objectRepo.save(obj)));
    }

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@RequestParam(required=false) String type, @RequestParam(required=false) String keyword,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<EvaluationObject> result;
        if(type!=null) result = objectRepo.findByType(type, pageable);
        else if(keyword!=null) result = objectRepo.findByNameContaining(keyword, pageable);
        else result = objectRepo.findAll(pageable);
        return ResponseEntity.ok(Map.of("code",0,"data",result.getContent(),"total",result.getTotalElements()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> get(@PathVariable Long id) {
        return objectRepo.findById(id).map(o -> ResponseEntity.ok(Map.<String,Object>of("code",0,"data",o)))
            .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String,Object>> update(@PathVariable Long id, @RequestBody Map<String,Object> body) {
        EvaluationObject obj = objectRepo.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        if(body.containsKey("name")) obj.setName((String)body.get("name"));
        if(body.containsKey("description")) obj.setDescription((String)body.get("description"));
        if(body.containsKey("framework")) obj.setFramework((String)body.get("framework"));
        if(body.containsKey("status")) obj.setStatus((String)body.get("status"));
        return ResponseEntity.ok(Map.of("code",0,"data",objectRepo.save(obj)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String,Object>> delete(@PathVariable Long id) {
        objectRepo.deleteById(id); return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }

    // ===== 版本管理 =====
    @PostMapping("/{id}/versions")
    public ResponseEntity<Map<String,Object>> createVersion(@PathVariable Long id, @RequestBody Map<String,Object> body, @AuthenticationPrincipal User user) {
        objectRepo.findById(id).orElseThrow(()->new RuntimeException("Object not found"));
        EvaluationObjectVersion v = new EvaluationObjectVersion();
        v.setObjectId(id); v.setVersion((String)body.get("version"));
        v.setDescription((String)body.get("description")); v.setFileReference((String)body.get("fileReference"));
        if(body.get("parentVersionId")!=null) v.setParentVersionId(Long.valueOf(body.get("parentVersionId").toString()));
        v.setCreatedBy(user.getId());
        return ResponseEntity.ok(Map.of("code",0,"data",versionRepo.save(v)));
    }

    @GetMapping("/{id}/versions")
    public ResponseEntity<Map<String,Object>> listVersions(@PathVariable Long id) {
        return ResponseEntity.ok(Map.of("code",0,"data",versionRepo.findByObjectIdOrderByCreatedAtDesc(id)));
    }
}
