package com.lab.asset;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * #379: /digital-assets alias — delegates to DigitalAssetController logic via shared service
 */
@Slf4j
@RestController
@RequestMapping("/digital-assets")
@RequiredArgsConstructor
public class DigitalAssetAliasController {

    private final DigitalAssetService assetService;

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

    @GetMapping("/stats")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(assetService.getStats()));
    }

    @GetMapping("/{id}")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<ApiResponse<DigitalAsset>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(assetService.getById(id)));
    }

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

    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<DigitalAsset>> create(
            @RequestBody DigitalAsset asset,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
        return ResponseEntity.ok(ApiResponse.ok(assetService.create(asset, userId)));
    }

    @PutMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<DigitalAsset>> update(
            @PathVariable Long id,
            @RequestBody DigitalAsset updates) {
        return ResponseEntity.ok(ApiResponse.ok(assetService.update(id, updates)));
    }

    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        assetService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok());
    }
}
