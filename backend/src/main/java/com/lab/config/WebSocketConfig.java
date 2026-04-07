package com.lab.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

/**
 * WebSocket configuration for task log streaming
 * #229
 *
 * Registers /ws/tasks endpoint (outside /api context-path)
 * Note: This uses raw WebSocket, not STOMP, to keep it simple
 */
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final TaskLogWebSocketHandler taskLogWebSocketHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(taskLogWebSocketHandler, "/ws/tasks")
                .setAllowedOrigins("*");
    }
}
