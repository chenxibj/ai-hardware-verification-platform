package com.lab.comparison;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
@Repository
public interface ComparisonRepository extends JpaRepository<ComparisonRecord, Long> {
    Page<ComparisonRecord> findByCreatedBy(Long userId, Pageable pageable);
    Page<ComparisonRecord> findByCompareType(String type, Pageable pageable);
}
