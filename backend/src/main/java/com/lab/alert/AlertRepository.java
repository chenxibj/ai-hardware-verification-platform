package com.lab.alert;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
public interface AlertRepository extends JpaRepository<Alert, Long> {
    Page<Alert> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);
    Page<Alert> findByUserIdAndIsReadOrderByCreatedAtDesc(Long userId, Boolean isRead, Pageable pageable);
    long countByUserIdAndIsRead(Long userId, Boolean isRead);
}
