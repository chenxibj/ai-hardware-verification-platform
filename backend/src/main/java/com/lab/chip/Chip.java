package com.lab.chip;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * 芯片实体类
 */
@Data
@Entity
@Table(name = "chips")
@NoArgsConstructor
@AllArgsConstructor
public class Chip {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "chip_no", unique = true, nullable = false, length = 32)
    private String chipNo;

    @Column(nullable = false)
    private String name;

    @JsonAlias({"vendor"})
    @Column(nullable = false)
    private String manufacturer;

    @Enumerated(EnumType.STRING)
    @Column(name = "chip_type", nullable = false, length = 16)
    private ChipType chipType;

    @Column(length = 100)
    private String architecture;

    @Column(length = 100)
    private String generation;

    @Column(name = "model_name", length = 200)
    private String modelName;

    @JsonAlias({"specs"})
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "tech_spec", columnDefinition = "jsonb")
    private String techSpec;

    @JsonAlias({"softwareEnv"})
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "software_stack", columnDefinition = "jsonb")
    private String softwareStack;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ChipStatus status;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "capability_profile", columnDefinition = "jsonb")
    private String capabilityProfile;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "profile_data", columnDefinition = "jsonb")
    private String profileData;


    /** #240: 峰值算力指标 */
    @Column(name = "peak_gflops_fp32")
    private Double peakGflopsFp32;

    @Column(name = "peak_gflops_fp16")
    private Double peakGflopsFp16;

    @Column(name = "peak_bandwidth_gbps")
    private Double peakBandwidthGbps;

    /** #433: 扩展规格字段 */
    @Column(name = "fp64_tflops")
    private Double fp64Tflops;

    @Column(name = "bf16_tflops")
    private Double bf16Tflops;

    @Column(name = "tf32_tflops")
    private Double tf32Tflops;

    @Column(name = "fp8_tflops")
    private Double fp8Tflops;

    @Column(name = "int8_tops")
    private Double int8Tops;

    @Column(name = "memory_gb")
    private Double memoryGb;

    @Column(name = "memory_type", length = 20)
    private String memoryType;

    @Column(name = "memory_bandwidth_tbps")
    private Double memoryBandwidthTbps;

    @Column(name = "interconnect_bandwidth_gbps")
    private Double interconnectBandwidthGbps;

    @Column(name = "interconnect_type", length = 50)
    private String interconnectType;

    @Column(name = "tdp_watts")
    private Integer tdpWatts;

    @Column(name = "process_node", length = 20)
    private String processNode;

    @Column(name = "supported_precisions", length = 200)
    private String supportedPrecisions;

    private String tags;
    private String remark;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    public enum ChipType {
        GPU, NPU, TPU, CPU, FPGA, ASIC, OTHER
    }

    public enum ChipStatus {
        UNEVALUATED, EVALUATING, EVALUATED, REGISTERED, ARCHIVED
    }
}
