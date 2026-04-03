package com.lab.chip;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * 芯片服务
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
        chip.setChipNo(generateChipNo());
        chip.setCreatedBy(userId);
        if (chip.getStatus() == null) {
            chip.setStatus(Chip.ChipStatus.UNEVALUATED);
        }
        Chip saved = chipRepository.save(chip);
        log.info("Created chip: {} ({})", saved.getChipNo(), saved.getName());
        return saved;
    }

    /**
     * 查询芯片列表
     */
    @Transactional(readOnly = true)
    public Page<Chip> listChips(Chip.ChipType chipType, Chip.ChipStatus status, String search, Pageable pageable) {
        if (search != null && !search.isBlank()) {
            return chipRepository.searchByNameOrManufacturer(search.trim(), pageable);
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
                .orElseThrow(() -> new RuntimeException("Chip not found: " + id));
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
        if (update.getTechSpec() != null) chip.setTechSpec(update.getTechSpec());
        if (update.getSoftwareStack() != null) chip.setSoftwareStack(update.getSoftwareStack());
        if (update.getStatus() != null) chip.setStatus(update.getStatus());
        if (update.getCapabilityProfile() != null) chip.setCapabilityProfile(update.getCapabilityProfile());
        if (update.getTags() != null) chip.setTags(update.getTags());
        if (update.getRemark() != null) chip.setRemark(update.getRemark());
        Chip saved = chipRepository.save(chip);
        log.info("Updated chip: {}", saved.getChipNo());
        return saved;
    }

    /**
     * 删除芯片
     */
    @Transactional
    public void deleteChip(Long id) {
        Chip chip = getChip(id);
        chipRepository.delete(chip);
        log.info("Deleted chip: {}", chip.getChipNo());
    }

    /**
     * 生成芯片编号
     */
    private String generateChipNo() {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneId.of("Asia/Shanghai"))
                .format(Instant.now());
        String seq = String.format("%03d", (int) (Math.random() * 1000));
        return "CHIP-" + date + "-" + seq;
    }
}
