#!/usr/bin/env python3
"""Fix ReportGeneratorService to compute operator scores from latency instead of reading stored score=50."""

filepath = "/root/ai-hardware-verification-platform/backend/src/main/java/com/lab/chipreport/ReportGeneratorService.java"
with open(filepath, 'r') as f:
    content = f.read()

# Replace the score extraction line to compute from latency
old = '                double score = toDouble(metrics.getOrDefault("score", flatMetrics.getOrDefault("score", 0)));'
new = '''                // Compute score from latency (like ScoringService) instead of using stored fallback
                double avgLatency = toDouble(flatMetrics.getOrDefault("latency_ms_mean", flatMetrics.getOrDefault("latency_mean", flatMetrics.getOrDefault("latencyMean", flatMetrics.getOrDefault("avg_latency_ms", 0)))));
                double score;
                if (avgLatency > 0) {
                    score = Math.max(0, Math.min(100, 100 - 20 * Math.log10(avgLatency)));
                } else {
                    score = 0;
                }'''

if old in content:
    content = content.replace(old, new, 1)
    with open(filepath, 'w') as f:
        f.write(content)
    print("OK: ReportGeneratorService operator score calculation fixed")
else:
    print("FAIL: Could not find target line")
    # Show what's there
    import re
    for m in re.finditer(r'double score.*?;', content):
        print(f"  Found: {m.group()}")
