package com.lab.chipreport;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface ChipReportRepository extends JpaRepository<ChipReport, Long> {
    Optional<ChipReport> findByReportNo(String reportNo);
    List<ChipReport> findByChipId(Long chipId);
    List<ChipReport> findByPlanId(Long planId);

    // For #169: filtered queries — exclude soft-deleted
    @Query("SELECT r FROM ChipReport r WHERE r.deleted = false " +
           "AND (:chipId IS NULL OR r.chipId = :chipId) " +
           "AND (:status IS NULL OR r.status = :status) " +
           "AND (:archived IS NULL OR r.archived = :archived) " +
           "AND (:startTime IS NULL OR r.createdAt >= :startTime) " +
           "AND (:endTime IS NULL OR r.createdAt <= :endTime) " +
           "ORDER BY r.createdAt DESC")
    Page<ChipReport> findFiltered(
            @Param("chipId") Long chipId,
            @Param("status") ChipReport.ReportStatus status,
            @Param("archived") Boolean archived,
            @Param("startTime") Instant startTime,
            @Param("endTime") Instant endTime,
            Pageable pageable);

    // For #169: version trend — all reports for a chip ordered by time
    @Query("SELECT r FROM ChipReport r WHERE r.chipId = :chipId AND r.deleted = false ORDER BY r.createdAt ASC")
    List<ChipReport> findByChipIdOrderByCreatedAtAsc(@Param("chipId") Long chipId);

    // Count active reports
    long countByDeletedFalse();
    long countByDeletedFalseAndStatus(ChipReport.ReportStatus status);
    long countByDeletedFalseAndArchivedTrue();
}
