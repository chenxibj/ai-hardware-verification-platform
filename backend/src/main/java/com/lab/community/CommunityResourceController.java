package com.lab.community;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 社区资源下载控制器 (#178 US-3.2)
 * GET /api/v1/community/resources - 资源列表
 * GET /api/v1/community/resources/{id}/download - 下载资源
 */
@Slf4j
@RestController
@RequestMapping("/community/resources")
@RequiredArgsConstructor
public class CommunityResourceController {

    private final CommunityResourceRepository resourceRepository;

    @GetMapping
    public ResponseEntity<Map<String, Object>> listResources(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String category) {
        List<CommunityResource> resources;
        if (keyword != null && !keyword.isEmpty()) {
            resources = resourceRepository.findByNameContainingIgnoreCase(keyword);
        } else if (category != null && !category.isEmpty()) {
            try {
                resources = resourceRepository.findByCategory(
                        CommunityResource.ResourceCategory.valueOf(category));
            } catch (IllegalArgumentException e) {
                resources = resourceRepository.findAll();
            }
        } else {
            resources = resourceRepository.findAll();
        }

        // Apply both filters
        if (keyword != null && !keyword.isEmpty() && category != null && !category.isEmpty()) {
            try {
                CommunityResource.ResourceCategory cat = CommunityResource.ResourceCategory.valueOf(category);
                resources = resources.stream()
                        .filter(r -> r.getCategory() == cat)
                        .collect(Collectors.toList());
            } catch (IllegalArgumentException ignored) {}
        }

        return ResponseEntity.ok(success(resources));
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<?> downloadResource(@PathVariable Long id) {
        Optional<CommunityResource> opt = resourceRepository.findById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.badRequest().body(error("Resource not found"));
        }

        CommunityResource resource = opt.get();

        // Increment download count
        resource.setDownloadCount(resource.getDownloadCount() + 1);
        resourceRepository.save(resource);

        // If file exists on disk, serve it
        if (resource.getFilePath() != null) {
            try {
                Path path = Paths.get(resource.getFilePath());
                if (Files.exists(path)) {
                    byte[] data = Files.readAllBytes(path);
                    ByteArrayResource fileResource = new ByteArrayResource(data);
                    return ResponseEntity.ok()
                            .contentType(MediaType.APPLICATION_OCTET_STREAM)
                            .header(HttpHeaders.CONTENT_DISPOSITION,
                                    "attachment; filename=\"" + resource.getFileName() + "\"")
                            .body(fileResource);
                }
            } catch (IOException e) {
                log.error("Failed to read file: {}", resource.getFilePath(), e);
            }
        }

        // Return a placeholder response with resource info
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "Resource download registered. File not yet uploaded.");
        resp.put("data", Map.of(
                "id", resource.getId(),
                "name", resource.getName(),
                "downloadCount", resource.getDownloadCount()
        ));
        return ResponseEntity.ok(resp);
    }

    private Map<String, Object> success(Object data) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 0);
        resp.put("message", "success");
        resp.put("data", data);
        return resp;
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("code", 1001);
        resp.put("message", message);
        return resp;
    }
}
