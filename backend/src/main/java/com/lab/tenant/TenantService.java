package com.lab.tenant;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * 租户服务
 * @feat #174 多租户管理
 */
@Service
public class TenantService {

    private final TenantRepository repo;
    private final ObjectMapper objectMapper;

    public TenantService(TenantRepository repo, ObjectMapper objectMapper) {
        this.repo = repo;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public Tenant create(TenantCreateRequest request) {
        // 检查名称唯一
        if (repo.findByName(request.getName()).isPresent()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "租户名称已存在: " + request.getName());
        }
        // 检查code唯一
        if (request.getCode() != null && repo.findByCode(request.getCode()).isPresent()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "租户编码已存在: " + request.getCode());
        }

        Tenant tenant = new Tenant();
        tenant.setName(request.getName());
        tenant.setDescription(request.getDescription());
        tenant.setCode(request.getCode());
        tenant.setContactEmail(request.getAdminEmail());
        tenant.setStatus(Tenant.Status.ACTIVE);

        // 构建配额JSON
        try {
            Map<String, Object> quota = Map.of(
                "max_chips", request.getMaxChips() != null ? request.getMaxChips() : 100,
                "max_concurrent", request.getMaxConcurrent() != null ? request.getMaxConcurrent() : 10,
                "storage_gb", request.getStorageGb() != null ? request.getStorageGb() : 500,
                "valid_until", request.getValidUntil() != null ? request.getValidUntil() : ""
            );
            tenant.setResourceQuota(objectMapper.writeValueAsString(quota));
        } catch (Exception e) {
            tenant.setResourceQuota("{}");
        }

        return repo.save(tenant);
    }

    public List<Tenant> list(String status, String keyword) {
        List<Tenant> tenants = repo.findAll(Sort.by(Sort.Direction.DESC, "createdAt"));

        if (status != null && !status.isBlank()) {
            try {
                Tenant.Status s = Tenant.Status.valueOf(status.toUpperCase());
                tenants = tenants.stream().filter(t -> t.getStatus() == s).toList();
            } catch (IllegalArgumentException ignored) {}
        }

        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.toLowerCase();
            tenants = tenants.stream()
                .filter(t -> (t.getName() != null && t.getName().toLowerCase().contains(kw))
                    || (t.getContactEmail() != null && t.getContactEmail().toLowerCase().contains(kw)))
                .toList();
        }

        return tenants;
    }

    public Tenant getById(Long id) {
        return repo.findById(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "租户不存在: " + id));
    }

    @Transactional
    public Tenant update(Long id, TenantUpdateRequest request) {
        Tenant tenant = getById(id);

        if (request.getName() != null) {
            repo.findByName(request.getName()).ifPresent(other -> {
                if (!other.getId().equals(id)) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "租户名称已存在: " + request.getName());
                }
            });
            tenant.setName(request.getName());
        }
        if (request.getDescription() != null) tenant.setDescription(request.getDescription());
        if (request.getAdminEmail() != null) tenant.setContactEmail(request.getAdminEmail());
        if (request.getStatus() != null) {
            try {
                tenant.setStatus(Tenant.Status.valueOf(request.getStatus().toUpperCase()));
            } catch (IllegalArgumentException ignored) {}
        }

        // 更新配额
        if (request.getMaxChips() != null || request.getMaxConcurrent() != null
            || request.getStorageGb() != null || request.getValidUntil() != null) {
            try {
                Map<String, Object> oldQuota = tenant.getResourceQuota() != null
                    ? objectMapper.readValue(tenant.getResourceQuota(), Map.class) : new java.util.HashMap<>();
                java.util.Map<String, Object> quota = new java.util.HashMap<>(oldQuota);
                if (request.getMaxChips() != null) quota.put("max_chips", request.getMaxChips());
                if (request.getMaxConcurrent() != null) quota.put("max_concurrent", request.getMaxConcurrent());
                if (request.getStorageGb() != null) quota.put("storage_gb", request.getStorageGb());
                if (request.getValidUntil() != null) quota.put("valid_until", request.getValidUntil());
                tenant.setResourceQuota(objectMapper.writeValueAsString(quota));
            } catch (Exception e) {
                // keep old quota
            }
        }

        return repo.save(tenant);
    }
}
