package com.lab.chip;

import com.lab.common.BusinessException;
import com.lab.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * 芯片服务
 * Enhanced: #159 — chipNo 自动生成（顺序） + 唯一性校验
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChipService {

    private final ChipRepository chipRepository;

    /**
     * 创建芯片 — 增强版
     * - 自动生成 chipNo（CHIP-YYYYMMDD-NNN 顺序递增）
     * - 唯一性校验：chipNo, name
     */
    @Transactional
    public Chip createChip(ChipCreateRequest req, Long userId) {
        // 唯一性检查: name
        if (chipRepository.existsByName(req.getName().trim())) {
            throw new BusinessException(ErrorCode.CHIP_NAME_DUPLICATE);
        }

        // 自动生成 chipNo（顺序递增，避免冲突）
        String chipNo = generateChipNo();

        Chip chip = new Chip();
        chip.setChipNo(chipNo);
        chip.setName(req.getName().trim());
        chip.setManufacturer(req.getManufacturer().trim());
        chip.setChipType(req.getChipType());
        chip.setTechSpec(req.getTechSpec());
        chip.setSoftwareStack(req.getSoftwareStack());
        chip.setRemark(req.getRemark());
        chip.setTags(req.getTags());
        chip.setStatus(Chip.ChipStatus.UNEVALUATED);
        chip.setCreatedBy(userId);

        Chip saved = chipRepository.save(chip);
        log.info("Created chip: {} ({}) by user {}", saved.getChipNo(), saved.getName(), userId);
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
                .orElseThrow(() -> new BusinessException(ErrorCode.CHIP_NOT_FOUND));
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
     * 按名称搜索芯片
     */
    @Transactional(readOnly = true)
    public List<Chip> searchByName(String name) {
        return chipRepository.findByNameContainingIgnoreCase(name.trim());
    }

    /**
     * 生成芯片编号: CHIP-YYYYMMDD-NNN（顺序递增）
     */
    private String generateChipNo() {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneId.of("Asia/Shanghai"))
                .format(Instant.now());
        String prefix = "CHIP-" + date + "-";

        // 查询当天已有的数量来递增
        long count = chipRepository.countByChipNoPrefix(prefix);
        String chipNo;
        int seq = (int) count + 1;

        // 防碰撞循环
        do {
            chipNo = prefix + String.format("%03d", seq);
            seq++;
        } while (chipRepository.existsByChipNo(chipNo));

        return chipNo;
    }
}
