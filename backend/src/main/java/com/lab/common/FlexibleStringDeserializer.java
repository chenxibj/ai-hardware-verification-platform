package com.lab.common;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;

/**
 * #414: 接受 JSON 字符串或 JSON 对象两种格式，统一输出为 JSON 字符串。
 * 前端传 "{}" 或 {} 都能正确反序列化。
 */
public class FlexibleStringDeserializer extends JsonDeserializer<String> {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        if (p.currentToken() == JsonToken.VALUE_STRING) {
            return p.getValueAsString();
        }
        // 对象或数组 → 序列化为字符串
        Object node = p.readValueAsTree();
        return MAPPER.writeValueAsString(node);
    }
}
