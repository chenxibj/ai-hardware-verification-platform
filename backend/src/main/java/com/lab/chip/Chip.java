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
        GPU, NPU, TPU, CPU, OTHER
    }

    public enum ChipStatus {
        UNEVALUATED, EVALUATING, EVALUATED
    }
}
