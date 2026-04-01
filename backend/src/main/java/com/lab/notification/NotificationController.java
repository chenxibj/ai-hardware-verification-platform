package com.lab.notification;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/notifications") @RequiredArgsConstructor
public class NotificationController {
    private final NotificationRepository notificationRepository;

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@AuthenticationPrincipal User user, @RequestParam(required=false) Boolean isRead,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC,"createdAt"));
        Page<Notification> notifications = isRead!=null
            ? notificationRepository.findByUserIdAndIsRead(user.getId(), isRead, pageable)
            : notificationRepository.findByUserId(user.getId(), pageable);
        Map<String,Object> res = new HashMap<>();
        res.put("code",0); res.put("data",notifications.getContent()); res.put("total",notifications.getTotalElements());
        res.put("unread", notificationRepository.countByUserIdAndIsRead(user.getId(), false));
        return ResponseEntity.ok(res);
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<Map<String,Object>> markRead(@PathVariable Long id) {
        Notification n = notificationRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        n.setIsRead(true); notificationRepository.save(n);
        return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }

    @PostMapping("/read-all")
    public ResponseEntity<Map<String,Object>> markAllRead(@AuthenticationPrincipal User user) {
        var unread = notificationRepository.findByUserIdAndIsRead(user.getId(), false, PageRequest.of(0,1000));
        unread.getContent().forEach(n -> { n.setIsRead(true); notificationRepository.save(n); });
        return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }

    @GetMapping("/count")
    public ResponseEntity<Map<String,Object>> unreadCount(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(Map.of("code",0,"data",Map.of("unread",notificationRepository.countByUserIdAndIsRead(user.getId(),false))));
    }
}
