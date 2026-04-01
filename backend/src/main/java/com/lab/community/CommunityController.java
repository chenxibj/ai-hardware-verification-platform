package com.lab.community;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/community") @RequiredArgsConstructor
public class CommunityController {
    private final ArticleRepository articleRepository;

    @PostMapping("/articles")
    public ResponseEntity<Map<String,Object>> createArticle(@RequestBody Map<String,Object> body, @AuthenticationPrincipal User user) {
        Article a = new Article();
        a.setTitle((String)body.get("title")); a.setContent((String)body.get("content"));
        a.setSummary((String)body.get("summary")); a.setCategory((String)body.getOrDefault("category","DISCUSSION"));
        a.setStatus("PUBLISHED"); a.setAuthorId(user.getId()); a.setAuthorName(user.getUsername());
        return ResponseEntity.ok(Map.of("code",0,"data",articleRepository.save(a)));
    }

    @GetMapping("/articles")
    public ResponseEntity<Map<String,Object>> listArticles(@RequestParam(required=false) String category, @RequestParam(required=false) String keyword,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC,"createdAt"));
        Page<Article> articles;
        if (keyword!=null&&!keyword.isBlank()) articles = articleRepository.findByTitleContaining(keyword, pageable);
        else if (category!=null) articles = articleRepository.findByCategory(category, pageable);
        else articles = articleRepository.findByStatus("PUBLISHED", pageable);
        Map<String,Object> res = new HashMap<>();
        res.put("code",0); res.put("data",articles.getContent()); res.put("total",articles.getTotalElements());
        return ResponseEntity.ok(res);
    }

    @GetMapping("/articles/{id}")
    public ResponseEntity<Map<String,Object>> getArticle(@PathVariable Long id) {
        return articleRepository.findById(id).map(a -> {
            a.setViewCount(a.getViewCount()+1); articleRepository.save(a);
            return ResponseEntity.ok(Map.<String,Object>of("code",0,"data",a));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/articles/{id}/like")
    public ResponseEntity<Map<String,Object>> likeArticle(@PathVariable Long id) {
        Article a = articleRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        a.setLikeCount(a.getLikeCount()+1); articleRepository.save(a);
        return ResponseEntity.ok(Map.of("code",0,"data",Map.of("likeCount",a.getLikeCount())));
    }

    @DeleteMapping("/articles/{id}")
    public ResponseEntity<Map<String,Object>> deleteArticle(@PathVariable Long id, @AuthenticationPrincipal User user) {
        Article a = articleRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        if (!a.getAuthorId().equals(user.getId()) && !"ADMIN".equals(user.getRole())) {
            return ResponseEntity.status(403).body(Map.of("code",1003,"message","无权限"));
        }
        articleRepository.deleteById(id); return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String,Object>> stats() {
        return ResponseEntity.ok(Map.of("code",0,"data",Map.of(
            "articles", articleRepository.countByStatus("PUBLISHED"),
            "tutorials", articleRepository.countByCategoryAndStatus("TUTORIAL", "PUBLISHED"),
            "discussions", articleRepository.countByCategoryAndStatus("DISCUSSION", "PUBLISHED"),
            "requirements", articleRepository.countByCategoryAndStatus("REQUIREMENT", "PUBLISHED")
        )));
    }
}
