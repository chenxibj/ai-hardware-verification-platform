package com.lab.template;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
public interface TaskTemplateRepository extends JpaRepository<TaskTemplate, Long> {
    List<TaskTemplate> findByIsSystemTrue();
    List<TaskTemplate> findByCreatedBy(Long userId);
    @Query("SELECT t FROM TaskTemplate t WHERE t.isSystem = true OR t.createdBy = :userId ORDER BY t.isSystem DESC, t.createdAt DESC")
    List<TaskTemplate> findAvailableTemplates(Long userId);
}
