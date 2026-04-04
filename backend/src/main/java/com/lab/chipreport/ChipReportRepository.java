package com.lab.chipreport;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ChipReportRepository extends JpaRepository<ChipReport, Long> {
    Optional<ChipReport> findByReportNo(String reportNo);
    List<ChipReport> findByChipId(Long chipId);
    List<ChipReport> findByPlanId(Long planId);

    Page<ChipReport> findByStatus(ChipReport.ReportStatus status, Pageable pageable);

    @Query("SELECT r FROM ChipReport r WHERE " +
           "(:status IS NULL OR r.status = :status) AND " +
           "(:chipId IS NULL OR r.chipId = :chipId) AND " +
           "(:minScore IS NULL OR r.overallScore >= :minScore) AND " +
           "(:maxScore IS NULL OR r.overallScore <= :maxScore)")
    Page<ChipReport> findFiltered(
            @Param("status") ChipReport.ReportStatus status,
            @Param("chipId") Long chipId,
            @Param("minScore") Double minScore,
            @Param("maxScore") Double maxScore,
            Pageable pageable);

    @Query("SELECT r FROM ChipReport r WHERE " +
           "r.reportNo LIKE %:keyword% OR " +
           "CAST(r.chipId AS string) = :keyword")
    Page<ChipReport> searchByKeyword(@Param("keyword") String keyword, Pageable pageable);

    List<ChipReport> findByIdIn(List<Long> ids);
}
