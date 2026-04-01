package com.lab.community;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.Instant;

@Data @Entity @Table(name = "articles") @NoArgsConstructor
public class Article {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 200) private String title;
    @Column(columnDefinition = "text") private String content;
    @Column(length = 500) private String summary;
    @Column(length = 32) private String category; // TUTORIAL, CASE_STUDY, ANNOUNCEMENT, DISCUSSION, REQUIREMENT
    @Column(length = 32) private String status = "DRAFT"; // DRAFT, PUBLISHED, ARCHIVED
    @Column(name = "view_count") private Integer viewCount = 0;
    @Column(name = "like_count") private Integer likeCount = 0;
    @Column(name = "comment_count") private Integer commentCount = 0;
    @Column(name = "is_pinned") private Boolean isPinned = false;
    @Column(name = "author_id", nullable = false) private Long authorId;
    @Column(name = "author_name", length = 50) private String authorName;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;
}
