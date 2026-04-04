package com.lab.alert;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AlertRepository extends JpaRepository<Alert, Long> {
    List<Alert> findByNodeId(Long nodeId);
    List<Alert> findByStatus(Alert.Status status);
    List<Alert> findByNodeIdAndStatusOrderByCreatedAtDesc(Long nodeId, Alert.Status status);
    List<Alert> findAllByOrderByCreatedAtDesc();
}
