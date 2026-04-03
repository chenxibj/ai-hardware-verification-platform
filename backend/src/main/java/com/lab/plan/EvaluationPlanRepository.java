package com.lab.plan;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface EvaluationPlanRepository extends JpaRepository<EvaluationPlan, Long> {
    Optional<EvaluationPlan> findByPlanNo(String planNo);
    List<EvaluationPlan> findByChipId(Long chipId);
    Page<EvaluationPlan> findByStatus(EvaluationPlan.PlanStatus status, Pageable pageable);
    Page<EvaluationPlan> findByChipId(Long chipId, Pageable pageable);
}
