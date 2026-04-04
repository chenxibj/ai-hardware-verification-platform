package com.lab.tenant;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import com.lab.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantService {

    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;

    public Page<Tenant> list(Pageable pageable) {
        return tenantRepository.findAll(pageable);
    }

    public Tenant getById(Long id) {
        return tenantRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "租户不存在: " + id));
    }

    public Tenant create(Tenant tenant) {
        // 自动生成 code
        if (tenant.getCode() == null || tenant.getCode().isBlank()) {
            tenant.setCode("org-" + System.currentTimeMillis());
        }
        // code 唯一校验
        tenantRepository.findByCode(tenant.getCode()).ifPresent(existing -> {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "租户编码已存在: " + tenant.getCode());
        });
        if (tenant.getStatus() == null) {
            tenant.setStatus(Tenant.Status.ACTIVE);
        }
        return tenantRepository.save(tenant);
    }

    public Tenant update(Long id, Tenant updates) {
        Tenant tenant = getById(id);
        if (updates.getName() != null) tenant.setName(updates.getName());
        if (updates.getDescription() != null) tenant.setDescription(updates.getDescription());
        if (updates.getContactEmail() != null) tenant.setContactEmail(updates.getContactEmail());
        if (updates.getStatus() != null) tenant.setStatus(updates.getStatus());
        if (updates.getResourceQuota() != null) tenant.setResourceQuota(updates.getResourceQuota());
        return tenantRepository.save(tenant);
    }

    public void delete(Long id) {
        Tenant tenant = getById(id);
        tenantRepository.delete(tenant);
    }

    /**
     * 获取租户列表 + 每个租户的用户数（简化实现：总用户数 / 租户数的模拟）
     */
    public List<Map<String, Object>> listWithUserCount() {
        List<Tenant> tenants = tenantRepository.findAll();
        long totalUsers = userRepository.count();
        return tenants.stream().map(t -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", t.getId());
            map.put("name", t.getName());
            map.put("code", t.getCode());
            map.put("description", t.getDescription());
            map.put("contactEmail", t.getContactEmail());
            map.put("status", t.getStatus());
            map.put("resourceQuota", t.getResourceQuota());
            map.put("createdAt", t.getCreatedAt());
            map.put("updatedAt", t.getUpdatedAt());
            // 简化: 均分用户数
            map.put("userCount", tenants.size() > 0 ? totalUsers / tenants.size() : 0);
            return map;
        }).toList();
    }
}
