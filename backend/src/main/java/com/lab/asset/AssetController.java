package com.lab.asset;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.common.ApiResponse;
import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * 数字资产管理 Controller
 * @feat #172 数字资产上传与管理 (US-2.4)
 */
@RestController
@RequestMapping("/assets")
public class AssetController {

    private final AssetService assetService;

    public AssetController(AssetService assetService) {
        this.assetService = assetService;
    }

    /**
     * 上传资产（支持文件上传到MinIO）
     */
    @PostMapping
    @RequireRole(Role.ENGINEER)
    public ApiResponse<DigitalAsset> create(
            @RequestParam(required = false) MultipartFile file,
            @RequestParam String name,
            @RequestParam String assetType,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) String tags,
            @RequestParam(required = false, defaultValue = "1.0") String version) {
        return ApiResponse.ok(assetService.create(name, assetType, description, tags, version, file));
    }

    /**
     * 资产列表
     */
    @GetMapping
    public ApiResponse<List<DigitalAsset>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String assetType,
            @RequestParam(required = false, defaultValue = "100") Integer size) {
        return ApiResponse.ok(assetService.list(keyword, assetType, size));
    }

    /**
     * 资产详情
     */
    @GetMapping("/{id}")
    public ApiResponse<DigitalAsset> getById(@PathVariable Long id) {
        return ApiResponse.ok(assetService.getById(id));
    }

    /**
     * 删除资产（被引用时禁止删除）
     */
    @DeleteMapping("/{id}")
    @RequireRole(Role.ENGINEER)
    public ApiResponse<Void> delete(@PathVariable Long id) {
        assetService.delete(id);
        return ApiResponse.ok();
    }

    /**
     * 资产统计
     */
    @GetMapping("/stats")
    public ApiResponse<Map<String, Object>> stats() {
        return ApiResponse.ok(assetService.stats());
    }

    /**
     * 下载资产文件
     */
    @GetMapping("/{id}/download")
    public void download(@PathVariable Long id, jakarta.servlet.http.HttpServletResponse response) {
        assetService.download(id, response);
    }
}
