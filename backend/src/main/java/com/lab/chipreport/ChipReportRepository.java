package com.lab.chipreport;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ChipReportRepository extends JpaRepository<ChipReport, Long> {
    Optional<ChipReport> findByReportNo(String reportNo);
    List<ChipReport> findByChipId(Long chipId);
    List<ChipReport> findByPlanId(Long planId);
}
