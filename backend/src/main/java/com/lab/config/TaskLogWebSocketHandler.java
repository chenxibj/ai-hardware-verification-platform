package com.lab.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.net.URI;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * WebSocket handler for real-time task log streaming
 * #229
 *
 * Client connects to: ws://host/ws/tasks?taskId=123
 * Server pushes: { "type": "LOG_ENTRY", "data": { ...log fields... } }
 *               { "type": "TASK_STATUS", "data": { "taskId": x, "status": "COMPLETED" } }
 */
@Slf4j
@Component
public class TaskLogWebSocketHandler extends TextWebSocketHandler {

    // taskId -> Set of sessions subscribed to that task
    private final Map<Long, Set<WebSocketSession>> taskSubscriptions = new ConcurrentHashMap<>();
    // sessionId -> taskId (for cleanup)
    private final Map<String, Long> sessionTaskMap = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        Long taskId = extractTaskId(session);
        if (taskId == null) {
            session.close(CloseStatus.BAD_DATA.withReason("Missing taskId parameter"));
            return;
        }

        sessionTaskMap.put(session.getId(), taskId);
        taskSubscriptions.computeIfAbsent(taskId, k -> new CopyOnWriteArraySet<>()).add(session);
        log.info("WebSocket connected: session={}, taskId={}", session.getId(), taskId);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        Long taskId = sessionTaskMap.remove(session.getId());
        if (taskId != null) {
            Set<WebSocketSession> sessions = taskSubscriptions.get(taskId);
            if (sessions != null) {
                sessions.remove(session);
                if (sessions.isEmpty()) {
                    taskSubscriptions.remove(taskId);
                }
            }
        }
        log.debug("WebSocket closed: session={}, taskId={}, status={}", session.getId(), taskId, status);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        // Client might send ping/pong or subscription messages
        // For now, we just acknowledge
        log.debug("Received message from {}: {}", session.getId(), message.getPayload());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.warn("WebSocket transport error: session={}, error={}", session.getId(), exception.getMessage());
        session.close(CloseStatus.SERVER_ERROR);
    }

    /**
     * Broadcast a JSON message to all sessions subscribed to a specific task
     */
    public void broadcastToTask(Long taskId, String jsonMessage) {
        Set<WebSocketSession> sessions = taskSubscriptions.get(taskId);
        if (sessions == null || sessions.isEmpty()) {
            return;
        }

        TextMessage textMessage = new TextMessage(jsonMessage);
        List<WebSocketSession> deadSessions = new ArrayList<>();

        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    synchronized (session) {
                        session.sendMessage(textMessage);
                    }
                } catch (IOException e) {
                    log.warn("Failed to send message to session {}: {}", session.getId(), e.getMessage());
                    deadSessions.add(session);
                }
            } else {
                deadSessions.add(session);
            }
        }

        // Clean up dead sessions
        for (WebSocketSession dead : deadSessions) {
            sessions.remove(dead);
            sessionTaskMap.remove(dead.getId());
        }
    }

    /**
     * Broadcast task status change
     */
    public void broadcastTaskStatus(Long taskId, String status) {
        String json = String.format(
                "{\"type\":\"TASK_STATUS\",\"data\":{\"taskId\":%d,\"status\":\"%s\"}}",
                taskId, status);
        broadcastToTask(taskId, json);
    }

    /**
     * Extract taskId from WebSocket URI query parameters
     */
    private Long extractTaskId(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) return null;
        try {
            var params = UriComponentsBuilder.fromUri(uri).build().getQueryParams();
            String taskIdStr = params.getFirst("taskId");
            return taskIdStr != null ? Long.parseLong(taskIdStr) : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
