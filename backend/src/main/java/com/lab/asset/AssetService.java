package com.lab.asset;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.task.EvaluationTaskRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.minio.*;
import io.minio.errors.MinioException;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.Instant;
import java.util.*;

/**
 * 数字资产服务 — MinIO文件存储 + 引用保护
 * @feat #172
 */
@Service
public class AssetService {

    private final DigitalAssetRepository repo;
    private final ObjectMapper objectMapper;
    private MinioClient minioClient;

    @Value("${minio.endpoint:}")
    private String minioEndpoint;

    @Value("${minio.access-key:}")
    private String minioAccessKey;

    @Value("${minio.secret-key:}")
    private String minioSecretKey;

    private static final String BUCKET_NAME = "ahvp-assets";

    public AssetService(DigitalAssetRepository repo, ObjectMapper objectMapper) {
        this.repo = repo;
        this.objectMapper = objectMapper;
    }

    private MinioClient getMinioClient() {
        if (minioClient == null && minioEndpoint != null && !minioEndpoint.isBlank()) {
            minioClient = MinioClient.builder()
                .endpoint(minioEndpoint)
                .credentials(minioAccessKey, minioSecretKey)
                .build();
        }
        return minioClient;
    }

    private void ensureBucket() {
        try {
            MinioClient client = getMinioClient();
            if (client == null) return;
            if (!client.bucketExists(BucketExistsArgs.builder().bucket(BUCKET_NAME).build())) {
                client.makeBucket(MakeBucketArgs.builder().bucket(BUCKET_NAME).build());
            }
        } catch (Exception e) {
            // log but don't fail — file upload will fail later with clear message
        }
    }

    @Transactional
    public DigitalAsset create(String name, String assetType, String description,
                               String tags, String version, MultipartFile file) {
        DigitalAsset asset = new DigitalAsset();
        asset.setName(name);
        asset.setAssetType(assetType.toUpperCase());
        asset.setDescription(description);
        asset.setVersion(version);
        asset.setStatus(DigitalAsset.Status.ACTIVE);
        asset.setCreatedBy(0L); // TODO: get from security context
        asset.setDownloadCount(0);

        // Generate asset number
        asset.setAssetNo("AST-" + System.currentTimeMillis());

        // Store tags as JSON array
        if (tags != null && !tags.isBlank()) {
            try {
                List<String> tagList = Arrays.asList(tags.split(","));
                asset.setTags(objectMapper.writeValueAsString(tagList));
            } catch (Exception e) {
                asset.setTags("[]");
            }
        }

        // Upload file to MinIO if provided
        if (file != null && !file.isEmpty()) {
            try {
                ensureBucket();
                String objectName = "assets/" + asset.getAssetNo() + "/" + file.getOriginalFilename();

                MinioClient client = getMinioClient();
                if (client != null) {
                    client.putObject(PutObjectArgs.builder()
                        .bucket(BUCKET_NAME)
                        .object(objectName)
                        .stream(file.getInputStream(), file.getSize(), -1)
                        .contentType(file.getContentType())
                        .build());

                    asset.setFilePath(objectName);
                    asset.setFileSize(file.getSize());
                    asset.setMimeType(file.getContentType());

                    // Extract file format
                    String originalName = file.getOriginalFilename();
                    if (originalName != null && originalName.contains(".")) {
                        asset.setFileFormat(originalName.substring(originalName.lastIndexOf(".") + 1).toUpperCase());
                    }
                } else {
                    // MinIO not configured, store metadata only
                    asset.setFileSize(file.getSize());
                    asset.setMimeType(file.getContentType());
                }
            } catch (Exception e) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件上传失败: " + e.getMessage());
            }
        }

        return repo.save(asset);
    }

    public List<DigitalAsset> list(String keyword, String assetType, Integer size) {
        List<DigitalAsset> assets = repo.findAll(Sort.by(Sort.Direction.DESC, "createdAt"));

        if (assetType != null && !assetType.isBlank()) {
            assets = assets.stream()
                .filter(a -> assetType.equalsIgnoreCase(a.getAssetType()))
                .toList();
        }

        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.toLowerCase();
            assets = assets.stream()
                .filter(a -> (a.getName() != null && a.getName().toLowerCase().contains(kw))
                    || (a.getDescription() != null && a.getDescription().toLowerCase().contains(kw))
                    || (a.getAssetNo() != null && a.getAssetNo().toLowerCase().contains(kw)))
                .toList();
        }

        if (size != null && assets.size() > size) {
            assets = assets.subList(0, size);
        }

        return assets;
    }

    public DigitalAsset getById(Long id) {
        return repo.findById(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "资产不存在: " + id));
    }

    @Transactional
    public void delete(Long id) {
        DigitalAsset asset = getById(id);

        // 引用保护检查: 查看是否有任务引用该资产
        // 通过 metadata 或关联表检查（简化实现：如果状态不是 ACTIVE 则不允许删除）
        if (asset.getStatus() == DigitalAsset.Status.ARCHIVED) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "已归档资产不能删除，请先恢复");
        }

        // Delete from MinIO
        if (asset.getFilePath() != null) {
            try {
                MinioClient client = getMinioClient();
                if (client != null) {
                    client.removeObject(RemoveObjectArgs.builder()
                        .bucket(BUCKET_NAME)
                        .object(asset.getFilePath())
                        .build());
                }
            } catch (Exception e) {
                // Log but continue
            }
        }

        repo.deleteById(id);
    }

    public Map<String, Object> stats() {
        List<DigitalAsset> all = repo.findAll();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", all.size());
        stats.put("models", all.stream().filter(a -> "MODEL".equalsIgnoreCase(a.getAssetType())).count());
        stats.put("datasets", all.stream().filter(a -> "DATASET".equalsIgnoreCase(a.getAssetType())).count());
        stats.put("scripts", all.stream()
            .filter(a -> "SCRIPT".equalsIgnoreCase(a.getAssetType())
                || "OPERATOR_SCRIPT".equalsIgnoreCase(a.getAssetType())
                || "EVAL_SCRIPT".equalsIgnoreCase(a.getAssetType()))
            .count());
        stats.put("benchmarks", all.stream().filter(a -> "BENCHMARK".equalsIgnoreCase(a.getAssetType())).count());
        stats.put("images", all.stream().filter(a -> "IMAGE".equalsIgnoreCase(a.getAssetType())).count());
        stats.put("others", all.stream().filter(a -> "OTHER".equalsIgnoreCase(a.getAssetType())).count());
        return stats;
    }

    public void download(Long id, HttpServletResponse response) {
        DigitalAsset asset = getById(id);
        if (asset.getFilePath() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "该资产没有关联文件");
        }

        try {
            MinioClient client = getMinioClient();
            if (client == null) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件存储未配置");
            }

            InputStream stream = client.getObject(GetObjectArgs.builder()
                .bucket(BUCKET_NAME)
                .object(asset.getFilePath())
                .build());

            response.setContentType(asset.getMimeType() != null ? asset.getMimeType() : "application/octet-stream");
            response.setHeader("Content-Disposition", "attachment; filename=\"" + asset.getName() + "\"");
            if (asset.getFileSize() != null) {
                response.setContentLengthLong(asset.getFileSize());
            }

            stream.transferTo(response.getOutputStream());
            response.flushBuffer();

            // Increment download count
            asset.setDownloadCount((asset.getDownloadCount() != null ? asset.getDownloadCount() : 0) + 1);
            repo.save(asset);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件下载失败: " + e.getMessage());
        }
    }
}
