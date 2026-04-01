package com.lab.dataset;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
public interface DatasetRepository extends JpaRepository<Dataset, Long> {
    Page<Dataset> findByType(String type, Pageable pageable);
    Page<Dataset> findByIsSystem(Boolean isSystem, Pageable pageable);
    Page<Dataset> findByNameContaining(String name, Pageable pageable);
}
