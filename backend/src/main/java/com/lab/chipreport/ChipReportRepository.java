package com.lab.chipreport;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface ChipReportRepository extends JpaRepository<ChipReport, Long>, JpaSpecificationExecutor<ChipReport> {
    Optional<ChipReport> findByReportNo(String reportNo);
    List<ChipReport> findByChipId(Long chipId);
    List<ChipReport> findByPlanId(Long planId);

    // For #169: version trend — all reports for a chip ordered by time
    @Query("SELECT r FROM ChipReport r WHERE r.chipId = :chipId AND r.deleted = false ORDER BY r.createdAt ASC")
    List<ChipReport> findByChipIdOrderByCreatedAtAsc(@Param("chipId") Long chipId);

    // Baseline support
    @Query("SELECT r FROM ChipReport r WHERE r.chipId = :chipId AND r.isBaseline = true AND r.deleted = false")
    Optional<ChipReport> findBaselineByChipId(@Param("chipId") Long chipId);

    @Modifying
    @Query("UPDATE ChipReport r SET r.isBaseline = false WHERE r.chipId = :chipId AND r.isBaseline = true")
    void clearBaselineByChipId(@Param("chipId") Long chipId);

    boolean existsByChipIdAndIsBaselineTrue(Long chipId);

    // Count active reports
    long countByDeletedFalse();
    long countByDeletedFalseAndStatus(ChipReport.ReportStatus status);
    long countByDeletedFalseAndArchivedTrue();
}
