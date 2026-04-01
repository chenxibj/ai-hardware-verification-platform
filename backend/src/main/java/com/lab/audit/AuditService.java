package com.lab.audit;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuditService {
    private final AuditLogRepository auditLogRepository;

    public void log(Long userId, String username, String action, String resourceType, Long resourceId, String detail) {
        AuditLog al = new AuditLog();
        al.setUserId(userId);
        al.setUsername(username);
        al.setAction(action);
        al.setResourceType(resourceType);
        al.setResourceId(resourceId);
        al.setDetail(detail);
        auditLogRepository.save(al);
    }

    public void log(Long userId, String username, String action, String resourceType, Long resourceId) {
        log(userId, username, action, resourceType, resourceId, null);
    }
}
