package com.lab.evalobject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
public interface EvaluationObjectRepository extends JpaRepository<EvaluationObject, Long> {
    Page<EvaluationObject> findByType(String type, Pageable pageable);
    Page<EvaluationObject> findByNameContaining(String name, Pageable pageable);
    Page<EvaluationObject> findByStatus(String status, Pageable pageable);
}
