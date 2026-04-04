package com.lab.asset;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/assets")
@RequiredArgsConstructor
public class DigitalAssetController {

    private final DigitalAssetService assetService;

    /**
     * 资产列表（分页 + 类型筛选）
     */
    @GetMapping
    @RequireRole(Role.VIEWER)
    public ResponseEntity<ApiResponse<List<DigitalAsset>>> list(
            @RequestParam(required = false) String assetType,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {
        Page<DigitalAsset> result = assetService.list(assetType, keyword,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        return ResponseEntity.ok(ApiResponse.ok(result.getContent()));
    }

    /**
     * 资产统计
     */
    @GetMapping("/stats")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(assetService.getStats()));
    }

    /**
     * 资产详情
     */
    @GetMapping("/{id}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<ApiResponse<DigitalAsset>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(assetService.getById(id)));
    }

    /**
     * 上传文件创建资产
     */
    @PostMapping("/upload")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<DigitalAsset>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String name,
            @RequestParam(required = false, defaultValue = "MISC") String assetType,
            @RequestParam(required = false) String description,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) throws IOException {
        if (userId == null) userId = 1L;
        DigitalAsset asset = assetService.upload(file, name, assetType, description, userId);
        return ResponseEntity.ok(ApiResponse.ok(asset));
    }

    /**
     * 手动创建资产（不上传文件）
     */
    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<DigitalAsset>> create(
            @RequestBody DigitalAsset asset,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
        return ResponseEntity.ok(ApiResponse.ok(assetService.create(asset, userId)));
    }

    /**
     * 下载资产文件
     */
    @GetMapping("/{id}/download")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Resource> download(@PathVariable Long id) {
        Path filePath = assetService.getFilePath(id);
        Resource resource = new FileSystemResource(filePath);
        String filename = filePath.getFileName().toString();
        String encodedFilename = URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedFilename)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }

    /**
     * 删除资产
     */
    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        assetService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok());
    }
}
