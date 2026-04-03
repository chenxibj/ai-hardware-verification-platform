package com.lab.chip;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 芯片 Repository
 */
@Repository
public interface ChipRepository extends JpaRepository<Chip, Long> {

    Optional<Chip> findByChipNo(String chipNo);

    List<Chip> findByChipType(Chip.ChipType chipType);

    List<Chip> findByStatus(Chip.ChipStatus status);

    Page<Chip> findByCreatedBy(Long userId, Pageable pageable);

    Page<Chip> findByChipType(Chip.ChipType chipType, Pageable pageable);

    Page<Chip> findByStatus(Chip.ChipStatus status, Pageable pageable);

    Page<Chip> findByChipTypeAndStatus(Chip.ChipType chipType, Chip.ChipStatus status, Pageable pageable);

    @Query("SELECT c FROM Chip c WHERE LOWER(c.name) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(c.manufacturer) LIKE LOWER(CONCAT('%', :search, '%'))")
    Page<Chip> searchByNameOrManufacturer(@Param("search") String search, Pageable pageable);
}
