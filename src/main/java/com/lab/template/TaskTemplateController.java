package com.lab.template;

import com.lab.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/templates")
public class TaskTemplateController {
    private final TaskTemplateRepository templateRepo;
    
    public TaskTemplateController(TaskTemplateRepository templateRepo) {
        this.templateRepo = templateRepo;
    }
    
    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body, @AuthenticationPrincipal User user) {
        TaskTemplate t = new TaskTemplate();
        t.setName((String) body.get("name"));
        t.setDescription((String) body.get("description"));
        t.setEvalType((String) body.getOrDefault("evalType", "GENERAL"));
        t.setConfigJson(body.get("configJson") != null ? body.get("configJson").toString() : "{}");
        t.setIsSystem(Boolean.FALSE);
        t.setCreatedBy(user.getId());
        t.setCreatedAt(Instant.now());
        t.setUpdatedAt(Instant.now());
        return ResponseEntity.ok(Map.of("code", 0, "data", templateRepo.save(t)));
    }
    
    @GetMapping
    public ResponseEntity<Map<String, Object>> list(@AuthenticationPrincipal User user) {
        List<TaskTemplate> templates = templateRepo.findAvailableTemplates(user.getId());
        return ResponseEntity.ok(Map.of("code", 0, "data", templates));
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable Long id) {
        return templateRepo.findById(id)
            .map(t -> ResponseEntity.ok(Map.of("code", (Object) 0, "data", (Object) t)))
            .orElse(ResponseEntity.notFound().build());
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> update(@PathVariable Long id, @RequestBody Map<String, Object> body, @AuthenticationPrincipal User user) {
        return templateRepo.findById(id).map(t -> {
            if (Boolean.TRUE.equals(t.getIsSystem())) {
                return ResponseEntity.badRequest().body(Map.of("code", (Object) 1, "message", (Object) "Cannot edit system template"));
            }
            if (!t.getCreatedBy().equals(user.getId())) {
                return ResponseEntity.badRequest().body(Map.of("code", (Object) 1, "message", (Object) "Not authorized"));
            }
            if (body.containsKey("name")) t.setName((String) body.get("name"));
            if (body.containsKey("description")) t.setDescription((String) body.get("description"));
            if (body.containsKey("evalType")) t.setEvalType((String) body.get("evalType"));
            if (body.containsKey("configJson")) t.setConfigJson(body.get("configJson").toString());
            t.setUpdatedAt(Instant.now());
            return ResponseEntity.ok(Map.of("code", (Object) 0, "data", (Object) templateRepo.save(t)));
        }).orElse(ResponseEntity.notFound().build());
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(@PathVariable Long id, @AuthenticationPrincipal User user) {
        TaskTemplate t = templateRepo.findById(id).orElseThrow(() -> new RuntimeException("Template not found"));
        if (Boolean.TRUE.equals(t.getIsSystem())) {
            return ResponseEntity.badRequest().body(Map.of("code", 1, "message", "Cannot delete system template"));
        }
        if (!t.getCreatedBy().equals(user.getId())) {
            return ResponseEntity.badRequest().body(Map.of("code", 1, "message", "Not authorized"));
        }
        templateRepo.deleteById(id);
        return ResponseEntity.ok(Map.of("code", 0, "message", "Deleted"));
    }
}
