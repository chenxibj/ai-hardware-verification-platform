package com.lab.scoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.plan.EvaluationPlan;
import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * RunSpec 推断服务
 * 从 ScoringService 拆分而来 (#543)
 * 负责：动态加载 GPU count→SpecId 映射，推断 plan 的 runSpecId
 */
@Slf4j
@Service
public class RunSpecResolver {

    private final ObjectMapper objectMapper;
    private final RunSpecRepository runSpecRepository;

    /**
     * #544: Dynamic GPU count to runSpecId mapping, loaded from DB at startup.
     */
    private volatile Map<Integer, Long> gpuCountToSpecId = new ConcurrentHashMap<>();

    /**
     * #530: Cache of inferred runSpecId from eval_config for plans with run_spec_id=NULL.
     * Key: planId -> inferred runSpecId (or -1 if inference failed/not possible)
     */
    private final Map<Long, Long> inferredSpecCache = new ConcurrentHashMap<>();

    public RunSpecResolver(ObjectMapper objectMapper, RunSpecRepository runSpecRepository) {
        this.objectMapper = objectMapper;
        this.runSpecRepository = runSpecRepository;
    }

    /**
     * #544: Load GPU count -> runSpecId mapping from DB at startup.
     */
    @PostConstruct
    public void initGpuCountToSpecIdMapping() {
        try {
            List<RunSpec> allSpecs = runSpecRepository.findAll();
            if (allSpecs.isEmpty()) {
                log.error("#544: run_specs table is empty! GPU count -> spec ID mapping will be empty. " +
                        "Scoring inference will not work.");
                gpuCountToSpecId = new ConcurrentHashMap<>();
                return;
            }

            Map<Integer, Long> newMapping = new ConcurrentHashMap<>();
            for (RunSpec spec : allSpecs) {
                int gpuCount = spec.getGpuPerNode() != null ? spec.getGpuPerNode() : 0;
                newMapping.putIfAbsent(gpuCount, spec.getId());
            }
            gpuCountToSpecId = newMapping;
            log.info("#544: Loaded GPU count -> spec ID mapping from DB: {}", gpuCountToSpecId);
        } catch (Exception e) {
            log.error("#544: Failed to load GPU count -> spec ID mapping from DB: {}. " +
                    "Scoring inference may not work correctly.", e.getMessage(), e);
            gpuCountToSpecId = new ConcurrentHashMap<>();
        }
    }

    /**
     * #530: Resolve the effective runSpecId for a plan.
     * If plan.runSpecId is set, use it directly.
     * If NULL, try to infer from plan.evalConfig JSON (gpuCount field).
     * Returns null if inference is not possible.
     */
    public Long resolveRunSpecId(EvaluationPlan plan) {
        if (plan == null) return null;
        if (plan.getRunSpecId() != null) return plan.getRunSpecId();

        Long cached = inferredSpecCache.get(plan.getId());
        if (cached != null) {
            return cached == -1L ? null : cached;
        }

        Long inferred = inferRunSpecIdFromEvalConfig(plan.getEvalConfig());
        inferredSpecCache.put(plan.getId(), inferred != null ? inferred : -1L);

        if (inferred != null) {
            log.info("#530: Inferred runSpecId={} from eval_config for plan {} (id={})",
                    inferred, plan.getPlanNo(), plan.getId());
        } else {
            log.debug("#530: Cannot infer runSpecId from eval_config for plan {} (id={})",
                    plan.getPlanNo(), plan.getId());
        }
        return inferred;
    }

    /**
     * #530/#544: Infer runSpecId from eval_config JSON string.
     * Uses dynamically loaded gpuCountToSpecId mapping from DB.
     */
    Long inferRunSpecIdFromEvalConfig(String evalConfig) {
        if (evalConfig == null || evalConfig.isEmpty()) return null;
        try {
            JsonNode config = objectMapper.readTree(evalConfig);
            JsonNode gpuCountNode = config.get("gpuCount");
            if (gpuCountNode == null || gpuCountNode.isNull()) {
                return gpuCountToSpecId.get(0);
            }
            int gpuCount = gpuCountNode.asInt(0);
            Long specId = gpuCountToSpecId.get(gpuCount);
            if (specId != null) {
                return specId;
            }
            log.warn("#530: Unknown gpuCount={} in eval_config, cannot infer runSpecId", gpuCount);
            return null;
        } catch (Exception e) {
            log.warn("#530: Failed to parse eval_config for runSpecId inference: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Clear the inferred spec cache.
     */
    public void clearInferredSpecCache() {
        inferredSpecCache.clear();
    }

    /**
     * Get the GPU count to spec ID mapping (for testing/diagnostics).
     */
    Map<Integer, Long> getGpuCountToSpecId() {
        return gpuCountToSpecId;
    }
}
