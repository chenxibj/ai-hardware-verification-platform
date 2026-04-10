package com.lab.asset;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DigitalAssetService {

    private static final String BASE_DIR = "/data/assets";
    private final DigitalAssetRepository repository;

    public Page<DigitalAsset> list(String assetType, String keyword, Pageable pageable) {
        if (assetType != null && !assetType.isBlank() && keyword != null && !keyword.isBlank()) {
            return repository.findByAssetTypeAndNameContainingIgnoreCase(assetType, keyword, pageable);
        }
        if (assetType != null && !assetType.isBlank()) {
            return repository.findByAssetType(assetType, pageable);
        }
        if (keyword != null && !keyword.isBlank()) {
            return repository.findByNameContainingIgnoreCase(keyword, pageable);
        }
        return repository.findAll(pageable);
    }

    public DigitalAsset getById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "资产不存在: " + id));
    }

    public DigitalAsset upload(MultipartFile file, String name, String assetType, String description, Long userId) throws IOException {
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "上传文件不能为空");
        }

        // 构建存储路径: /data/assets/{assetType}/{yyyy-MM-dd}/{uuid}-{filename}
        String dateDir = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        String uuid = UUID.randomUUID().toString().substring(0, 8);
        String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";
        String safeFilename = uuid + "-" + originalFilename.replaceAll("[^a-zA-Z0-9._-]", "_");

        String typeDir = assetType != null ? assetType : "MISC";
        Path dirPath = Paths.get(BASE_DIR, typeDir, dateDir);
        Files.createDirectories(dirPath);
        Path filePath = dirPath.resolve(safeFilename);
        file.transferTo(filePath.toFile());

        log.info("File uploaded: {} -> {}", originalFilename, filePath);

        // 构建资产记录
        DigitalAsset asset = new DigitalAsset();
        asset.setAssetNo("ASSET-" + System.currentTimeMillis());
        asset.setName(name != null && !name.isBlank() ? name : originalFilename);
        asset.setAssetType(typeDir);
        asset.setDescription(description);
        asset.setFilePath(filePath.toString());
        asset.setFileSize(file.getSize());
        asset.setMimeType(file.getContentType());
        asset.setFileFormat(getFileExtension(originalFilename));
        asset.setCreatedBy(userId != null ? userId : 1L);
        asset.setStatus(DigitalAsset.Status.ACTIVE);
        asset.setDownloadCount(0);

        return repository.save(asset);
    }

    public DigitalAsset create(DigitalAsset asset, Long userId) {
        asset.setAssetNo("ASSET-" + System.currentTimeMillis());
        asset.setCreatedBy(userId != null ? userId : 1L);
        asset.setStatus(DigitalAsset.Status.ACTIVE);
        asset.setDownloadCount(0);
        return repository.save(asset);
    }

    /**
     * 全量更新资产 (#322)
     */
    public DigitalAsset update(Long id, DigitalAsset updates) {
        DigitalAsset asset = getById(id);
        if (updates.getName() != null) asset.setName(updates.getName());
        if (updates.getAssetType() != null) asset.setAssetType(updates.getAssetType());
        if (updates.getDescription() != null) asset.setDescription(updates.getDescription());
        if (updates.getVersion() != null) asset.setVersion(updates.getVersion());
        if (updates.getSourceUrl() != null) asset.setSourceUrl(updates.getSourceUrl());
        if (updates.getStatus() != null) asset.setStatus(updates.getStatus());
        if (updates.getTags() != null) asset.setTags(updates.getTags());
        if (updates.getMetadata() != null) asset.setMetadata(updates.getMetadata());
        return repository.save(asset);
    }

    /**
     * 部分更新资产 (#322)
     */
    public DigitalAsset partialUpdate(Long id, java.util.Map<String, Object> fields) {
        DigitalAsset asset = getById(id);
        fields.forEach((key, value) -> {
            switch (key) {
                case "name" -> asset.setName((String) value);
                case "assetType" -> asset.setAssetType((String) value);
                case "description" -> asset.setDescription((String) value);
                case "version" -> asset.setVersion((String) value);
                case "sourceUrl" -> asset.setSourceUrl((String) value);
                case "tags" -> asset.setTags(value instanceof String ? (String) value : value.toString());
                case "metadata" -> asset.setMetadata(value instanceof String ? (String) value : value.toString());
                case "status" -> {
                    if (value instanceof String s) {
                        asset.setStatus(DigitalAsset.Status.valueOf(s));
                    }
                }
                default -> { /* ignore unknown fields */ }
            }
        });
        return repository.save(asset);
    }

    public void delete(Long id) {
        DigitalAsset asset = getById(id);
        // 删除物理文件
        if (asset.getFilePath() != null) {
            try {
                Files.deleteIfExists(Paths.get(asset.getFilePath()));
            } catch (IOException e) {
                log.warn("Failed to delete file: {}", asset.getFilePath(), e);
            }
        }
        repository.delete(asset);
    }

    public Map<String, Object> getStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total", repository.count());
        stats.put("models", repository.countByAssetType("MODEL"));
        stats.put("datasets", repository.countByAssetType("DATASET"));
        stats.put("scripts", repository.countByAssetType("SCRIPT"));
        stats.put("configs", repository.countByAssetType("CONFIG"));
        stats.put("benchmarks", repository.countByAssetType("BENCHMARK"));
        stats.put("logs", repository.countByAssetType("LOG"));
        return stats;
    }


    /**
     * 批量删除资产 (#329)
     */
    public int batchDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            try {
                delete(id);
                count++;
            } catch (Exception e) {
                log.warn("Failed to delete asset {}: {}", id, e.getMessage());
            }
        }
        return count;
    }

    public Path getFilePath(Long id) {
        DigitalAsset asset = getById(id);
        if (asset.getFilePath() == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "该资产没有关联文件");
        }
        Path path = Paths.get(asset.getFilePath());
        if (!Files.exists(path)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "文件不存在: " + asset.getFilePath());
        }
        // 更新下载次数
        asset.setDownloadCount(asset.getDownloadCount() + 1);
        repository.save(asset);
        return path;
    }

    private String getFileExtension(String filename) {
        int dotIdx = filename.lastIndexOf(".");
        return dotIdx > 0 ? filename.substring(dotIdx + 1).toUpperCase() : "";
    }
}
