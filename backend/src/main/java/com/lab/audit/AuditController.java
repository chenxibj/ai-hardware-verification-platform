package com.lab.audit;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/audit") @RequiredArgsConstructor
public class AuditController {
    private final AuditLogRepository auditLogRepository;

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@RequestParam(required=false) Long userId, @RequestParam(required=false) String action,
            @RequestParam(required=false) String resourceType, @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="50") int size) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<AuditLog> logs;
        if (userId!=null) logs = auditLogRepository.findByUserId(userId, pageable);
        else if (action!=null) logs = auditLogRepository.findByAction(action, pageable);
        else if (resourceType!=null) logs = auditLogRepository.findByResourceType(resourceType, pageable);
        else logs = auditLogRepository.findAll(pageable);
        Map<String,Object> res = new HashMap<>();
        res.put("code",0); res.put("data",logs.getContent()); res.put("total",logs.getTotalElements());
        return ResponseEntity.ok(res);
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String,Object>> stats() {
        return ResponseEntity.ok(Map.of("code",0,"data",Map.of(
            "total", auditLogRepository.count(),
            "creates", auditLogRepository.countByAction("CREATE"),
            "updates", auditLogRepository.countByAction("UPDATE"),
            "deletes", auditLogRepository.countByAction("DELETE"),
            "logins", auditLogRepository.countByAction("LOGIN")
        )));
    }
}
