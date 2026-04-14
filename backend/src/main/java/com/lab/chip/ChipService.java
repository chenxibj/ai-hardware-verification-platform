package com.lab.chip;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import com.lab.common.XssUtils;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 芯片服务（v3.2适配）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChipService {

    private final ChipRepository chipRepository;
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

    /**
     * 创建芯片
     */
    @Transactional
    public Chip createChip(Chip chip, Long userId) {
        // 自动生成编号: CHIP-YYYYMMDD-NNN
        chip.setChipNo(generateChipNo());
        chip.setCreatedBy(userId);
        if (chip.getStatus() == null) {
            chip.setStatus(Chip.ChipStatus.REGISTERED);
        }
        // XSS sanitization (#331)
        chip.setName(XssUtils.stripXss(chip.getName()));
        if (chip.getManufacturer() != null) chip.setManufacturer(XssUtils.stripXss(chip.getManufacturer()));
        if (chip.getRemark() != null) chip.setRemark(XssUtils.stripXss(chip.getRemark()));
        if (chip.getTags() != null) chip.setTags(XssUtils.stripXss(chip.getTags()));

        // 校验
        if (chip.getName() == null || chip.getName().isBlank()) {
            throw new RuntimeException("芯片名称不能为空");
        }
        // #373: 芯片名称唯一性校验
        if (chipRepository.existsByNameIgnoreCase(chip.getName())) {
            throw new RuntimeException("芯片名称已存在: " + chip.getName());
        }
        if (chip.getManufacturer() == null || chip.getManufacturer().isBlank()) {
            throw new RuntimeException("厂商不能为空");
        }
        if (chip.getChipType() == null) {
            throw new RuntimeException("芯片类型不能为空");
        }

        // #367: Validate JSON fields before save
        validateJsonField(chip.getTechSpec(), "techSpec");
        validateJsonField(chip.getSoftwareStack(), "softwareStack");
        validateJsonField(chip.getCapabilityProfile(), "capabilityProfile");
        validateJsonField(chip.getProfileData(), "profileData");
        // #367: Validate JSON fields before save
        validateJsonField(chip.getTechSpec(), "techSpec");
        validateJsonField(chip.getSoftwareStack(), "softwareStack");
        validateJsonField(chip.getCapabilityProfile(), "capabilityProfile");
        validateJsonField(chip.getProfileData(), "profileData");

        Chip saved = chipRepository.save(chip);
        log.info("Created chip: {} ({}) type={} vendor={} arch={} gen={} model={}",
                saved.getChipNo(), saved.getName(), saved.getChipType(),
                saved.getManufacturer(), saved.getArchitecture(),
                saved.getGeneration(), saved.getModelName());
        return saved;
    }

    /**
     * 查询芯片列表
     */
    @Transactional(readOnly = true)
    public Page<Chip> listChips(Chip.ChipType chipType, Chip.ChipStatus status, String search, String vendor, Pageable pageable) {
        if (search != null && !search.isBlank()) {
            return chipRepository.searchByNameOrManufacturer(search.trim(), pageable);
        }
        if (vendor != null && !vendor.isBlank()) {
            return chipRepository.findByManufacturerContainingIgnoreCase(vendor.trim(), pageable);
        }
        if (chipType != null && status != null) {
            return chipRepository.findByChipTypeAndStatus(chipType, status, pageable);
        } else if (chipType != null) {
            return chipRepository.findByChipType(chipType, pageable);
        } else if (status != null) {
            return chipRepository.findByStatus(status, pageable);
        }
        return chipRepository.findAll(pageable);
    }

    /**
     * 查询芯片详情
     */
    @Transactional(readOnly = true)
    public Chip getChip(Long id) {
        return chipRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("芯片不存在: " + id));
    }

    /**
     * 更新芯片
     */
    @Transactional
    public Chip updateChip(Long id, Chip update) {
        Chip chip = getChip(id);
        if (update.getName() != null) chip.setName(XssUtils.stripXss(update.getName()));
        if (update.getManufacturer() != null) chip.setManufacturer(update.getManufacturer());
        if (update.getChipType() != null) chip.setChipType(update.getChipType());
        if (update.getArchitecture() != null) chip.setArchitecture(update.getArchitecture());
        if (update.getGeneration() != null) chip.setGeneration(update.getGeneration());
        if (update.getModelName() != null) chip.setModelName(update.getModelName());
        if (update.getTechSpec() != null) chip.setTechSpec(update.getTechSpec());
        if (update.getSoftwareStack() != null) chip.setSoftwareStack(update.getSoftwareStack());
        if (update.getStatus() != null) chip.setStatus(update.getStatus());
        if (update.getCapabilityProfile() != null) chip.setCapabilityProfile(update.getCapabilityProfile());
        if (update.getProfileData() != null) chip.setProfileData(update.getProfileData());
        if (update.getTags() != null) chip.setTags(update.getTags());
        if (update.getRemark() != null) chip.setRemark(update.getRemark());
        // #240: peak performance fields
        if (update.getPeakGflopsFp32() != null) chip.setPeakGflopsFp32(update.getPeakGflopsFp32());
        if (update.getPeakGflopsFp16() != null) chip.setPeakGflopsFp16(update.getPeakGflopsFp16());
        if (update.getPeakBandwidthGbps() != null) chip.setPeakBandwidthGbps(update.getPeakBandwidthGbps());
        // #433: 扩展规格字段
        if (update.getFp64Tflops() != null) chip.setFp64Tflops(update.getFp64Tflops());
        if (update.getBf16Tflops() != null) chip.setBf16Tflops(update.getBf16Tflops());
        if (update.getTf32Tflops() != null) chip.setTf32Tflops(update.getTf32Tflops());
        if (update.getFp8Tflops() != null) chip.setFp8Tflops(update.getFp8Tflops());
        if (update.getInt8Tops() != null) chip.setInt8Tops(update.getInt8Tops());
        if (update.getMemoryGb() != null) chip.setMemoryGb(update.getMemoryGb());
        if (update.getMemoryType() != null) chip.setMemoryType(update.getMemoryType());
        if (update.getMemoryBandwidthTbps() != null) chip.setMemoryBandwidthTbps(update.getMemoryBandwidthTbps());
        if (update.getInterconnectBandwidthGbps() != null) chip.setInterconnectBandwidthGbps(update.getInterconnectBandwidthGbps());
        if (update.getInterconnectType() != null) chip.setInterconnectType(update.getInterconnectType());
        if (update.getTdpWatts() != null) chip.setTdpWatts(update.getTdpWatts());
        if (update.getProcessNode() != null) chip.setProcessNode(update.getProcessNode());
        if (update.getSupportedPrecisions() != null) chip.setSupportedPrecisions(update.getSupportedPrecisions());
        // #367: Validate JSON fields before save
        validateJsonField(chip.getTechSpec(), "techSpec");
        validateJsonField(chip.getSoftwareStack(), "softwareStack");
        validateJsonField(chip.getCapabilityProfile(), "capabilityProfile");
        validateJsonField(chip.getProfileData(), "profileData");
        // #367: Validate JSON fields before save
        validateJsonField(chip.getTechSpec(), "techSpec");
        validateJsonField(chip.getSoftwareStack(), "softwareStack");
        validateJsonField(chip.getCapabilityProfile(), "capabilityProfile");
        validateJsonField(chip.getProfileData(), "profileData");

        Chip saved = chipRepository.save(chip);
        log.info("Updated chip: {}", saved.getChipNo());
        return saved;
    }

    /**
     * 软删除芯片（设置状态为ARCHIVED）
     */
    @Transactional
    public void softDeleteChip(Long id) {
        Chip chip = getChip(id);
        chip.setStatus(Chip.ChipStatus.ARCHIVED);
        chipRepository.save(chip);
        log.info("Soft-deleted (archived) chip: {}", chip.getChipNo());
    }

    /**
     * 硬删除芯片（向后兼容）
     */
    @Transactional
    public void deleteChip(Long id) {
        Chip chip = getChip(id);
        chipRepository.delete(chip);
        log.info("Deleted chip: {}", chip.getChipNo());
    }

    /**
     * 按名称搜索芯片
     */
    @Transactional(readOnly = true)
    public List<Chip> searchByName(String name) {
        return chipRepository.findByNameContainingIgnoreCase(name.trim());
    }

    /**
     * 生成芯片编号: CHIP-YYYYMMDD-NNN
     */
    /**
     * #367: 校验 JSON 字符串是否合法
     */
    private void validateJsonField(String value, String fieldName) {
        if (value == null || value.isBlank()) return;
        try {
            JSON_MAPPER.readTree(value);
        } catch (Exception e) {
            throw new RuntimeException(fieldName + " 必须是合法的 JSON 格式，当前值无法解析: " + e.getMessage());
        }
    }

    private synchronized String generateChipNo() {
        String today = LocalDate.now(ZoneId.of("Asia/Shanghai"))
                .format(DateTimeFormatter.BASIC_ISO_DATE);
        String prefix = "CHIP-" + today + "-";
        long count = chipRepository.countByChipNoStartingWith(prefix);
        String seq = String.format("%03d", count + 1);
        return prefix + seq;
    }

    /**
     * 部分更新芯片 (PATCH)
     * #341: 使用 Map 接收部分字段，仅更新传入的非 null 字段
     */
    @Transactional
    public Chip patchChip(Long id, Map<String, Object> fields) {
        Chip chip = getChip(id);

        if (fields.containsKey("name")) {
            Object v = fields.get("name");
            if (v != null) chip.setName(v.toString());
        }
        if (fields.containsKey("manufacturer") || fields.containsKey("vendor")) {
            Object v = fields.containsKey("manufacturer") ? fields.get("manufacturer") : fields.get("vendor");
            if (v != null) chip.setManufacturer(v.toString());
        }
        if (fields.containsKey("chipType")) {
            Object v = fields.get("chipType");
            if (v != null) chip.setChipType(Chip.ChipType.valueOf(v.toString()));
        }
        if (fields.containsKey("architecture")) {
            Object v = fields.get("architecture");
            chip.setArchitecture(v != null ? v.toString() : null);
        }
        if (fields.containsKey("generation")) {
            Object v = fields.get("generation");
            chip.setGeneration(v != null ? v.toString() : null);
        }
        if (fields.containsKey("modelName")) {
            Object v = fields.get("modelName");
            chip.setModelName(v != null ? v.toString() : null);
        }
        if (fields.containsKey("techSpec") || fields.containsKey("specs")) {
            Object v = fields.containsKey("techSpec") ? fields.get("techSpec") : fields.get("specs");
            chip.setTechSpec(v != null ? v.toString() : null);
        }
        if (fields.containsKey("softwareStack") || fields.containsKey("softwareEnv")) {
            Object v = fields.containsKey("softwareStack") ? fields.get("softwareStack") : fields.get("softwareEnv");
            chip.setSoftwareStack(v != null ? v.toString() : null);
        }
        if (fields.containsKey("status")) {
            Object v = fields.get("status");
            if (v != null) chip.setStatus(Chip.ChipStatus.valueOf(v.toString()));
        }
        if (fields.containsKey("capabilityProfile")) {
            Object v = fields.get("capabilityProfile");
            chip.setCapabilityProfile(v != null ? v.toString() : null);
        }
        if (fields.containsKey("profileData")) {
            Object v = fields.get("profileData");
            chip.setProfileData(v != null ? v.toString() : null);
        }
        if (fields.containsKey("tags")) {
            Object v = fields.get("tags");
            chip.setTags(v != null ? v.toString() : null);
        }
        if (fields.containsKey("remark")) {
            Object v = fields.get("remark");
            chip.setRemark(v != null ? v.toString() : null);
        }
        if (fields.containsKey("peakGflopsFp32")) {
            Object v = fields.get("peakGflopsFp32");
            chip.setPeakGflopsFp32(v != null ? Double.parseDouble(v.toString()) : null);
        }
        if (fields.containsKey("peakGflopsFp16")) {
            Object v = fields.get("peakGflopsFp16");
            chip.setPeakGflopsFp16(v != null ? Double.parseDouble(v.toString()) : null);
        }
        if (fields.containsKey("peakBandwidthGbps")) {
            Object v = fields.get("peakBandwidthGbps");
            chip.setPeakBandwidthGbps(v != null ? Double.parseDouble(v.toString()) : null);
        }
        // #433: 扩展规格字段 patch
        if (fields.containsKey("fp64Tflops")) {
            Object v = fields.get("fp64Tflops");
            chip.setFp64Tflops(v != null ? Double.parseDouble(v.toString()) : null);
        }
        if (fields.containsKey("bf16Tflops")) {
            Object v = fields.get("bf16Tflops");
            chip.setBf16Tflops(v != null ? Double.parseDouble(v.toString()) : null);
        }
        if (fields.containsKey("tf32Tflops")) {
            Object v = fields.get("tf32Tflops");
            chip.setTf32Tflops(v != null ? Double.parseDouble(v.toString()) : null);
        }
        if (fields.containsKey("fp8Tflops")) {
            Object v = fields.get("fp8Tflops");
            chip.setFp8Tflops(v != null ? Double.parseDouble(v.toString()) : null);
        }
        if (fields.containsKey("int8Tops")) {
            Object v = fields.get("int8Tops");
            chip.setInt8Tops(v != null ? Double.parseDouble(v.toString()) : null);
        }
        if (fields.containsKey("memoryGb")) {
            Object v = fields.get("memoryGb");
            chip.setMemoryGb(v != null ? Double.parseDouble(v.toString()) : null);
        }
        if (fields.containsKey("memoryType")) {
            Object v = fields.get("memoryType");
            chip.setMemoryType(v != null ? v.toString() : null);
        }
        if (fields.containsKey("memoryBandwidthTbps")) {
            Object v = fields.get("memoryBandwidthTbps");
            chip.setMemoryBandwidthTbps(v != null ? Double.parseDouble(v.toString()) : null);
        }
        if (fields.containsKey("interconnectBandwidthGbps")) {
            Object v = fields.get("interconnectBandwidthGbps");
            chip.setInterconnectBandwidthGbps(v != null ? Double.parseDouble(v.toString()) : null);
        }
        if (fields.containsKey("interconnectType")) {
            Object v = fields.get("interconnectType");
            chip.setInterconnectType(v != null ? v.toString() : null);
        }
        if (fields.containsKey("tdpWatts")) {
            Object v = fields.get("tdpWatts");
            chip.setTdpWatts(v != null ? Integer.parseInt(v.toString()) : null);
        }
        if (fields.containsKey("processNode")) {
            Object v = fields.get("processNode");
            chip.setProcessNode(v != null ? v.toString() : null);
        }
        if (fields.containsKey("supportedPrecisions")) {
            Object v = fields.get("supportedPrecisions");
            chip.setSupportedPrecisions(v != null ? v.toString() : null);
        }

        // #367: Validate JSON fields before save
        validateJsonField(chip.getTechSpec(), "techSpec");
        validateJsonField(chip.getSoftwareStack(), "softwareStack");
        validateJsonField(chip.getCapabilityProfile(), "capabilityProfile");
        validateJsonField(chip.getProfileData(), "profileData");
        // #367: Validate JSON fields before save
        validateJsonField(chip.getTechSpec(), "techSpec");
        validateJsonField(chip.getSoftwareStack(), "softwareStack");
        validateJsonField(chip.getCapabilityProfile(), "capabilityProfile");
        validateJsonField(chip.getProfileData(), "profileData");

        Chip saved = chipRepository.save(chip);
        log.info("Patched chip: {} fields={}", saved.getChipNo(), fields.keySet());
        return saved;
    }
}
