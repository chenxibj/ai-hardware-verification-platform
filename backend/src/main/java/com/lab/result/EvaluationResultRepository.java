package com.lab.result;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface EvaluationResultRepository extends JpaRepository<EvaluationResult, Long> {
    Optional<EvaluationResult> findByTaskId(Long taskId);
    List<EvaluationResult> findByPlanId(Long planId);
    List<EvaluationResult> findByChipId(Long chipId);
}
