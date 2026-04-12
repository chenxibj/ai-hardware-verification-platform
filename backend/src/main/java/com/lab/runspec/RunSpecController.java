package com.lab.runspec;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * #394: 运行规格 CRUD API
 */
@RestController
@RequestMapping("/run-specs")
public class RunSpecController {

    private final RunSpecRepository repo;

    public RunSpecController(RunSpecRepository repo) {
        this.repo = repo;
    }

    @GetMapping
    public ApiResponse<List<RunSpec>> list(@RequestParam(required = false) String category) {
        List<RunSpec> specs;
        if (category != null && !category.isBlank()) {
            specs = repo.findByCategory(category);
        } else {
            specs = repo.findAll();
        }
        return ApiResponse.ok(specs);
    }

    @GetMapping("/{id}")
    public ApiResponse<RunSpec> getById(@PathVariable Long id) {
        RunSpec spec = repo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "运行规格不存在: " + id));
        return ApiResponse.ok(spec);
    }

    @GetMapping("/code/{code}")
    public ApiResponse<RunSpec> getByCode(@PathVariable String code) {
        RunSpec spec = repo.findByCode(code)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "运行规格不存在: " + code));
        return ApiResponse.ok(spec);
    }

    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ApiResponse<RunSpec> create(@RequestBody RunSpec spec) {
        if (spec.getCode() == null || spec.getCode().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "code 不能为空");
        }
        if (repo.findByCode(spec.getCode()).isPresent()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "code 已存在: " + spec.getCode());
        }
        return ApiResponse.ok(repo.save(spec));
    }

    @PutMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<RunSpec> update(@PathVariable Long id, @RequestBody RunSpec updates) {
        RunSpec existing = repo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "运行规格不存在: " + id));
        if (updates.getName() != null) existing.setName(updates.getName());
        if (updates.getNodeCount() != null) existing.setNodeCount(updates.getNodeCount());
        if (updates.getGpuPerNode() != null) existing.setGpuPerNode(updates.getGpuPerNode());
        if (updates.getGpuExclusive() != null) existing.setGpuExclusive(updates.getGpuExclusive());
        if (updates.getCpuCores() != null) existing.setCpuCores(updates.getCpuCores());
        if (updates.getCpuExclusive() != null) existing.setCpuExclusive(updates.getCpuExclusive());
        if (updates.getMemoryGb() != null) existing.setMemoryGb(updates.getMemoryGb());
        if (updates.getParallelMode() != null) existing.setParallelMode(updates.getParallelMode());
        if (updates.getCategory() != null) existing.setCategory(updates.getCategory());
        if (updates.getDescription() != null) existing.setDescription(updates.getDescription());
        return ApiResponse.ok(repo.save(existing));
    }

    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Void> delete(@PathVariable Long id) {
        RunSpec spec = repo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "运行规格不存在: " + id));
        if (Boolean.TRUE.equals(spec.getIsSystem())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "系统预置规格不可删除");
        }
        repo.deleteById(id);
        return ApiResponse.ok();
    }
}
