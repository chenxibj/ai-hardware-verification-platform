package com.lab.community;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
@Repository
public interface ArticleRepository extends JpaRepository<Article, Long> {
    Page<Article> findByStatus(String status, Pageable pageable);
    Page<Article> findByCategory(String category, Pageable pageable);
    Page<Article> findByTitleContaining(String keyword, Pageable pageable);
    Page<Article> findByAuthorId(Long authorId, Pageable pageable);
    long countByStatus(String status);
    long countByCategory(String category);
    long countByCategoryAndStatus(String category, String status);
}
