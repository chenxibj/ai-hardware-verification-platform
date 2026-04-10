package com.lab.common;

/**
 * XSS utility (#331, #334)
 */
public class XssUtils {

    private XssUtils() {}

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
}
