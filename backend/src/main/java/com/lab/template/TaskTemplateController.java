package com.lab.template;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/templates") @RequiredArgsConstructor
public class TaskTemplateController {
    private final TaskTemplateRepository templateRepo;

    @PostMapping
    public ResponseEntity<Map<String,Object>> create(@RequestBody Map<String,Object> body, @AuthenticationPrincipal User user) {
        TaskTemplate t = new TaskTemplate();
        t.setName((String)body.get("name")); t.setDescription((String)body.get("description"));
        t.setEvalType((String)body.getOrDefault("evalType","GENERAL"));
        t.setConfigJson(body.get("configJson")!=null ? body.get("configJson").toString() : "{}");
        t.setIsSystem(false); t.setCreatedBy(user.getId());
        return ResponseEntity.ok(Map.of("code",0,"data",templateRepo.save(t)));
    }

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@AuthenticationPrincipal User user) {
        var templates = templateRepo.findAvailableTemplates(user.getId());
        return ResponseEntity.ok(Map.of("code",0,"data",templates));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> get(@PathVariable Long id) {
        return templateRepo.findById(id).map(t -> ResponseEntity.ok(Map.<String,Object>of("code",0,"data",t)))
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String,Object>> delete(@PathVariable Long id, @AuthenticationPrincipal User user) {
        var t = templateRepo.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        if(t.getIsSystem()) return ResponseEntity.badRequest().body(Map.of("code",1,"message","Cannot delete system template"));
        if(!t.getCreatedBy().equals(user.getId()) && !user.isAdmin()) return ResponseEntity.status(403).body(Map.of("code",1,"message","Forbidden"));
        templateRepo.deleteById(id); return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }
}
