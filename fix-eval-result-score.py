#!/usr/bin/env python3
"""Fix EvaluationResultService to compute dimension scores from latency."""

filepath = "/root/ai-hardware-verification-platform/backend/src/main/java/com/lab/result/EvaluationResultService.java"
with open(filepath, 'r') as f:
    content = f.read()

old = '                double score = toDouble(metrics.getOrDefault("score", 0));'
new = '''                // Compute score from latency instead of trusting stored score field
                Map<String, Object> flatM = flattenMetrics(metrics);
                double lat = toDouble(flatM.getOrDefault("latency_ms_mean", flatM.getOrDefault("latency_mean", flatM.getOrDefault("latencyMean", flatM.getOrDefault("avg_latency_ms", 0)))));
                double score = lat > 0 ? Math.max(0, Math.min(100, 100 - 20 * Math.log10(lat))) : 0;'''

if old in content:
    content = content.replace(old, new, 1)
    # Check if flattenMetrics exists
    if 'private Map<String, Object> flattenMetrics' not in content:
        # Add flattenMetrics method before the last }
        flatten_method = '''
    /**
     * Flatten nested metrics structure for score calculation.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> flattenMetrics(Map<String, Object> metrics) {
        Map<String, Object> flat = new LinkedHashMap<>(metrics);
        try {
            Object resultObj = metrics.get("result");
            if (resultObj instanceof Map) {
                Map<String, Object> result = (Map<String, Object>) resultObj;
                Object evalResult = result.get("eval_result");
                if (evalResult instanceof Map) {
                    Map<String, Object> eval = (Map<String, Object>) evalResult;
                    Object summary = eval.get("summary");
                    if (summary instanceof Map) {
                        flat.putAll((Map<String, Object>) summary);
                    }
                    Object results = eval.get("results");
                    if (results instanceof java.util.List) {
                        java.util.List<Object> resultList = (java.util.List<Object>) results;
                        if (!resultList.isEmpty() && resultList.get(0) instanceof Map) {
                            ((Map<String, Object>) resultList.get(0)).forEach(flat::putIfAbsent);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Failed to flatten metrics: {}", e.getMessage());
        }
        return flat;
    }
'''
        # Insert before the last closing brace
        last_brace = content.rfind('}')
        content = content[:last_brace] + flatten_method + '\n' + content[last_brace:]
        print("  Added flattenMetrics method")

    with open(filepath, 'w') as f:
        f.write(content)
    print("OK: EvaluationResultService score computation fixed")
else:
    print("FAIL: Could not find target line")
