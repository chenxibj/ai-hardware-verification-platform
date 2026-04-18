package com.lab.gpu;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * #396: GPU Slot API
 * #493: 使用 GpuSlotStatus 枚举替代字符串魔法值
 */
@RestController
public class GpuSlotController {

    private final GpuSlotService gpuSlotService;
    private final GpuSlotRepository gpuSlotRepository;

    public GpuSlotController(GpuSlotService gpuSlotService, GpuSlotRepository gpuSlotRepository) {
        this.gpuSlotService = gpuSlotService;
        this.gpuSlotRepository = gpuSlotRepository;
    }

    /**
     * 查看节点 GPU 使用情况
     */
    @GetMapping("/nodes/{nodeId}/gpu-slots")
    public ApiResponse<List<GpuSlot>> getNodeGpuSlots(@PathVariable Long nodeId) {
        return ApiResponse.ok(gpuSlotService.getNodeGpuSlots(nodeId));
    }

    /**
     * GPU 全局使用概览
     */
    @GetMapping("/gpu-slots/summary")
    public ApiResponse<Map<String, Object>> getSummary() {
        List<GpuSlot> all = gpuSlotRepository.findAll();
        long total = all.size();
        long free = all.stream().filter(s -> s.getStatus() == GpuSlotStatus.FREE).count();
        long allocated = all.stream().filter(s -> s.getStatus() == GpuSlotStatus.ALLOCATED).count();
        long error = all.stream().filter(s -> s.getStatus() == GpuSlotStatus.ERROR).count();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalSlots", total);
        summary.put("freeSlots", free);
        summary.put("allocatedSlots", allocated);
        summary.put("errorSlots", error);
        summary.put("utilizationPercent", total > 0 ? Math.round(allocated * 100.0 / total) : 0);
        return ApiResponse.ok(summary);
    }
}
