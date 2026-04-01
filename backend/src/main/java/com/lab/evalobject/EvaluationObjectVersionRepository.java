package com.lab.evalobject;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface EvaluationObjectVersionRepository extends JpaRepository<EvaluationObjectVersion, Long> {
    List<EvaluationObjectVersion> findByObjectIdOrderByCreatedAtDesc(Long objectId);
}
