package com.lab.workflow;
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

@RestController @RequestMapping("/workflows") @RequiredArgsConstructor
public class WorkflowController {
    private final WorkflowRepository workflowRepository;

    @PostMapping
    public ResponseEntity<Map<String,Object>> create(@RequestBody Map<String,Object> body, @AuthenticationPrincipal User user) {
        Workflow w = new Workflow();
        w.setWorkflowNo("WF-" + Instant.now().getEpochSecond() + "-" + String.format("%03d",(int)(Math.random()*1000)));
        w.setName((String)body.get("name")); w.setDescription((String)body.get("description"));
        w.setSteps(body.get("steps")!=null?body.get("steps").toString():null);
        w.setTriggerConfig(body.get("triggerConfig")!=null?body.get("triggerConfig").toString():null);
        w.setStatus("DRAFT"); w.setCreatedBy(user.getId());
        return ResponseEntity.ok(Map.of("code",0,"data",workflowRepository.save(w)));
    }

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@RequestParam(required=false) String status, @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        Page<Workflow> wfs = status!=null ? workflowRepository.findByStatus(status, PageRequest.of(page,size,Sort.by(Sort.Direction.DESC,"createdAt")))
            : workflowRepository.findAll(PageRequest.of(page,size,Sort.by(Sort.Direction.DESC,"createdAt")));
        Map<String,Object> res = new HashMap<>(); res.put("code",0); res.put("data",wfs.getContent()); res.put("total",wfs.getTotalElements());
        return ResponseEntity.ok(res);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> get(@PathVariable Long id) {
        return workflowRepository.findById(id).map(w->ResponseEntity.ok(Map.<String,Object>of("code",0,"data",w))).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<Map<String,Object>> updateStatus(@PathVariable Long id, @RequestBody Map<String,String> body) {
        Workflow w = workflowRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        w.setStatus(body.get("status")); workflowRepository.save(w);
        return ResponseEntity.ok(Map.of("code",0,"data",w));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String,Object>> delete(@PathVariable Long id) {
        workflowRepository.deleteById(id); return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String,Object>> stats() {
        return ResponseEntity.ok(Map.of("code",0,"data",Map.of(
            "total", workflowRepository.count(), "active", workflowRepository.countByStatus("ACTIVE"),
            "draft", workflowRepository.countByStatus("DRAFT"), "disabled", workflowRepository.countByStatus("DISABLED")
        )));
    }
}
