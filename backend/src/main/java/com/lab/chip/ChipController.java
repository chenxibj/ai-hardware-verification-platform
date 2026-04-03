package com.lab.chip;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 芯片管理控制器
 */
@Slf4j
@RestController
@RequestMapping("/chips")
@RequiredArgsConstructor
public class ChipController {

    private final ChipService chipService;

    /**
     * 创建芯片
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createChip(
            @RequestBody Chip chip,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        if (userId == null) userId = 1L;
        Chip created = chipService.createChip(chip, userId);
        return ResponseEntity.ok(success(created));
    }

    /**
     * 查询芯片列表
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> listChips(
            @RequestParam(required = false) String chipType,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        Chip.ChipType type = chipType != null ? Chip.ChipType.valueOf(chipType) : null;
        Chip.ChipStatus st = status != null ? Chip.ChipStatus.valueOf(status) : null;
        Page<Chip> chips = chipService.listChips(type, st, pageable);
        Map<String, Object> resp = success(chips.getContent());
        resp.put("total", chips.getTotalElements());
        resp.put("page", page);
        resp.put("size", size);
        return ResponseEntity.ok(resp);
    }

    /**
     * 查询芯片详情
     */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getChip(@PathVariable Long id) {
        try {
            Chip chip = chipService.getChip(id);
            return ResponseEntity.ok(success(chip));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * 更新芯片
     */
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateChip(
            @PathVariable Long id,
            @RequestBody Chip chip) {
        try {
            Chip updated = chipService.updateChip(id, chip);
            return ResponseEntity.ok(success(updated));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /**
     * 删除芯片
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteChip(@PathVariable Long id) {
        try {
            chipService.deleteChip(id);
            return ResponseEntity.ok(success("deleted"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
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
