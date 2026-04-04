package com.lab.chip;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 芯片注册请求 DTO
 * Issue: #159
 */
@Data
public class ChipCreateRequest {

    @NotBlank(message = "芯片名称不能为空")
    private String name;

    @NotBlank(message = "厂商不能为空")
    private String manufacturer;

    @NotNull(message = "芯片类型不能为空")
    private Chip.ChipType chipType;

    /** 技术规格 JSON: {computePower, memory, tdp, frequency, cores} */
    private String techSpec;

    /** 软件栈 JSON: {driver, sdk, frameworks:[]} */
    private String softwareStack;

    private String description;

    private String tags;

    private String remark;
}
