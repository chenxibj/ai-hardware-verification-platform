package com.lab.dimension;

import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.stream.Collectors;

/**
 * #459: Dimension metadata API
 * Returns the Single Source of Truth dimension definitions to frontend.
 */
@RestController
@RequestMapping("/dimensions")
public class DimensionController {

    @GetMapping
    public Map<String, Object> listDimensions() {
        List<Map<String, Object>> dims = DimensionRegistry.DIMENSIONS.stream().map(d -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", d.key());
            m.put("label", d.label());
            m.put("primaryMetric", d.primaryMetric());
            m.put("direction", d.direction());
            m.put("operators", d.operators());
            return m;
        }).collect(Collectors.toList());

        // Also provide quick lookup maps for frontend convenience
        Map<String, String> keyToLabel = new LinkedHashMap<>();
        Map<String, String> labelToKey = new LinkedHashMap<>();
        for (DimensionRegistry.DimensionDef d : DimensionRegistry.DIMENSIONS) {
            keyToLabel.put(d.key(), d.label());
            labelToKey.put(d.label(), d.key());
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("code", 0);
        result.put("data", Map.of(
            "dimensions", dims,
            "keyToLabel", keyToLabel,
            "labelToKey", labelToKey,
            "allKeys", DimensionRegistry.allKeys(),
            "allLabels", DimensionRegistry.allLabels()
        ));
        return result;
    }
}
