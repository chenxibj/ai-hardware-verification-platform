package com.lab.template;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TaskTemplateRepository extends JpaRepository<TaskTemplate, Long> {
    List<TaskTemplate> findByIsSystemTrue();
    List<TaskTemplate> findByCreatedBy(Long userId);

    @Query("SELECT t FROM TaskTemplate t WHERE t.isSystem = true OR t.createdBy = :userId")
    List<TaskTemplate> findAvailableTemplates(@Param("userId") Long userId);
}
