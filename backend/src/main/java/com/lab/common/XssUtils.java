package com.lab.common;

/**
 * XSS utility (#331, #334, #501)
 */
public class XssUtils {

    private XssUtils() {}

    /**
     * Allowed name pattern: letters, numbers, Chinese chars, spaces, -, _, (), dots, middle dots
     */
    private static final String VALID_NAME_PATTERN = "^[\\w\\u4e00-\\u9fa5\\s\\-_()\uff08\uff09.\u00b7\u3001\uff0c]+$";

    public static String sanitize(String input) {
        if (input == null) return null;
        return input
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#x27;");
    }

    public static boolean containsXss(String input) {
        if (input == null) return false;
        String lower = input.toLowerCase();
        return lower.contains("<script") ||
               lower.contains("javascript:") ||
               lower.contains("onerror") ||
               lower.contains("onload") ||
               lower.contains("onclick") ||
               lower.contains("<img") ||
               lower.contains("<iframe") ||
               lower.contains("<svg") ||
               lower.contains("eval(");
    }

    public static String stripXss(String input) {
        if (input == null) return null;
        String result = input.replaceAll("(?i)<script[^>]*>.*?</script>", "");
        result = result.replaceAll("(?i)\\s+on\\w+\\s*=\\s*[\"'][^\"']*[\"']", "");
        result = result.replaceAll("(?i)javascript\\s*:", "");
        result = result.replaceAll("<[^>]+>", "");
        return result.trim();
    }

    /**
     * #501: Validate a name field — reject illegal characters instead of silently stripping.
     * Allowed: letters, numbers, Chinese, spaces, -, _, (), dots, middle dots
     * @return null if valid, error message if invalid
     */
    public static String validateName(String name, String fieldLabel, int maxLength) {
        if (name == null || name.isBlank()) {
            return fieldLabel + "不能为空";
        }
        if (name.length() > maxLength) {
            return fieldLabel + "长度不能超过" + maxLength + "个字符";
        }
        if (containsXss(name)) {
            return fieldLabel + "包含非法字符";
        }
        if (!name.matches(VALID_NAME_PATTERN)) {
            return fieldLabel + "包含非法字符";
        }
        return null;
    }

    /**
     * #501: Validate a text field (description etc.) — more lenient but still rejects XSS
     * @return null if valid, error message if invalid
     */
    public static String validateText(String text, String fieldLabel, int maxLength) {
        if (text == null || text.isBlank()) {
            return null;  // text fields are optional
        }
        if (text.length() > maxLength) {
            return fieldLabel + "长度不能超过" + maxLength + "个字符";
        }
        if (containsXss(text)) {
            return fieldLabel + "包含非法字符";
        }
        return null;
    }
}
