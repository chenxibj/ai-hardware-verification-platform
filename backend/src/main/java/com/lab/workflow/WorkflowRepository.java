package com.lab.workflow;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
@Repository
public interface WorkflowRepository extends JpaRepository<Workflow, Long> {
    Page<Workflow> findByStatus(String status, Pageable pageable);
    long countByStatus(String status);
}
