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

/**
 * 芯片服务（v3.2适配）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChipService {

    private final ChipRepository chipRepository;

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
        // 校验
        if (chip.getName() == null || chip.getName().isBlank()) {
            throw new RuntimeException("芯片名称不能为空");
        }
        if (chip.getManufacturer() == null || chip.getManufacturer().isBlank()) {
            throw new RuntimeException("厂商不能为空");
        }
        if (chip.getChipType() == null) {
            throw new RuntimeException("芯片类型不能为空");
        }

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
        if (update.getName() != null) chip.setName(update.getName());
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
    private synchronized String generateChipNo() {
        String today = LocalDate.now(ZoneId.of("Asia/Shanghai"))
                .format(DateTimeFormatter.BASIC_ISO_DATE);
        String prefix = "CHIP-" + today + "-";
        long count = chipRepository.countByChipNoStartingWith(prefix);
        String seq = String.format("%03d", count + 1);
        return prefix + seq;
    }
}
