package com.lab.alert;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/alerts") @RequiredArgsConstructor
public class AlertController {
    private final AlertRepository alertRepo;

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@AuthenticationPrincipal User user,
            @RequestParam(required=false) Boolean unreadOnly,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        var pageable = PageRequest.of(page, size);
        var alerts = (unreadOnly!=null && unreadOnly)
            ? alertRepo.findByUserIdAndIsReadOrderByCreatedAtDesc(user.getId(), false, pageable)
            : alertRepo.findByUserIdOrderByCreatedAtDesc(user.getId(), pageable);
        long unread = alertRepo.countByUserIdAndIsRead(user.getId(), false);
        return ResponseEntity.ok(Map.of("code",0,"data",alerts.getContent(),"total",alerts.getTotalElements(),"unreadCount",unread));
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<Map<String,Object>> markRead(@PathVariable Long id) {
        var alert = alertRepo.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        alert.setIsRead(true); alert.setReadAt(Instant.now());
        return ResponseEntity.ok(Map.of("code",0,"data",alertRepo.save(alert)));
    }

    @PostMapping("/read-all")
    public ResponseEntity<Map<String,Object>> markAllRead(@AuthenticationPrincipal User user) {
        var alerts = alertRepo.findByUserIdAndIsReadOrderByCreatedAtDesc(user.getId(), false, PageRequest.of(0,1000));
        alerts.forEach(a -> { a.setIsRead(true); a.setReadAt(Instant.now()); alertRepo.save(a); });
        return ResponseEntity.ok(Map.of("code",0,"message","All marked as read"));
    }
}
