package com.lab.task;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 评测任务 Controller 公共响应构建工具。
 * 保持与原 EvaluationTaskController 完全一致的 JSON 格式：
 *   {"code":0, "message":"success", "data": ...}
 * 避免 50+ 处 HashMap 手动构建。
 */
final class TaskResponseHelper {

    private TaskResponseHelper() {}

    /** 成功响应（带 data） */
    static Map<String, Object> ok(Object data) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("code", 0);
        r.put("message", "success");
        r.put("data", data);
        return r;
    }

    /** 成功响应（无 data） */
    static Map<String, Object> ok() {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("code", 0);
        r.put("message", "success");
        return r;
    }

    /** 成功响应，带额外顶层字段 */
    static Map<String, Object> ok(Object data, Map<String, Object> extras) {
        Map<String, Object> r = ok(data);
        if (extras != null) r.putAll(extras);
        return r;
    }

    /** 错误响应 */
    static Map<String, Object> error(int code, String message) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("code", code);
        r.put("message", message);
        return r;
    }
}
