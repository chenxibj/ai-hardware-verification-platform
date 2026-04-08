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
 * #229: Task-level subscriptions
 * #244/#245: Plan-level subscriptions
 *
 * Client connects to: ws://host/ws/tasks?taskId=123
 *                 or: ws://host/ws/tasks?planId=456
 * Server pushes: { "type": "LOG_ENTRY", "data": { ...log fields... } }
 *               { "type": "TASK_STATUS", "data": { "taskId": x, "status": "COMPLETED" } }
 */
@Slf4j
@Component
public class TaskLogWebSocketHandler extends TextWebSocketHandler {

    // taskId -> Set of sessions subscribed to that task
    private final Map<Long, Set<WebSocketSession>> taskSubscriptions = new ConcurrentHashMap<>();
    // planId -> Set of sessions subscribed to that plan
    private final Map<Long, Set<WebSocketSession>> planSubscriptions = new ConcurrentHashMap<>();
    // sessionId -> taskId (for cleanup)
    private final Map<String, Long> sessionTaskMap = new ConcurrentHashMap<>();
    // sessionId -> planId (for cleanup)
    private final Map<String, Long> sessionPlanMap = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        Long taskId = extractParam(session, "taskId");
        Long planId = extractParam(session, "planId");

        if (taskId == null && planId == null) {
            session.close(CloseStatus.BAD_DATA.withReason("Missing taskId or planId parameter"));
            return;
        }

        if (taskId != null) {
            sessionTaskMap.put(session.getId(), taskId);
            taskSubscriptions.computeIfAbsent(taskId, k -> new CopyOnWriteArraySet<>()).add(session);
            log.info("WebSocket connected: session={}, taskId={}", session.getId(), taskId);
        }

        if (planId != null) {
            sessionPlanMap.put(session.getId(), planId);
            planSubscriptions.computeIfAbsent(planId, k -> new CopyOnWriteArraySet<>()).add(session);
            log.info("WebSocket connected: session={}, planId={}", session.getId(), planId);
        }
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

        Long planId = sessionPlanMap.remove(session.getId());
        if (planId != null) {
            Set<WebSocketSession> sessions = planSubscriptions.get(planId);
            if (sessions != null) {
                sessions.remove(session);
                if (sessions.isEmpty()) {
                    planSubscriptions.remove(planId);
                }
            }
        }

        log.debug("WebSocket closed: session={}, taskId={}, planId={}, status={}", session.getId(), taskId, planId, status);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        // Client might send ping/pong or subscription messages
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
        if (sessions != null && !sessions.isEmpty()) {
            sendToSessions(sessions, jsonMessage);
        }
    }

    /**
     * Broadcast a JSON message to all sessions subscribed to a specific plan
     */
    public void broadcastToPlan(Long planId, String jsonMessage) {
        Set<WebSocketSession> sessions = planSubscriptions.get(planId);
        if (sessions != null && !sessions.isEmpty()) {
            sendToSessions(sessions, jsonMessage);
        }
    }

    /**
     * Broadcast to both task-level and plan-level subscribers
     */
    public void broadcastLog(Long taskId, Long planId, String jsonMessage) {
        broadcastToTask(taskId, jsonMessage);
        if (planId != null) {
            broadcastToPlan(planId, jsonMessage);
        }
    }

    /**
     * Broadcast task status change to both task and plan subscribers
     */
    public void broadcastTaskStatus(Long taskId, String status) {
        String json = String.format(
                "{\"type\":\"TASK_STATUS\",\"data\":{\"taskId\":%d,\"status\":\"%s\"}}",
                taskId, status);
        broadcastToTask(taskId, json);
    }

    public void broadcastTaskStatus(Long taskId, Long planId, String status) {
        String json = String.format(
                "{\"type\":\"TASK_STATUS\",\"data\":{\"taskId\":%d,\"status\":\"%s\"}}",
                taskId, status);
        broadcastToTask(taskId, json);
        if (planId != null) {
            broadcastToPlan(planId, json);
        }
    }

    private void sendToSessions(Set<WebSocketSession> sessions, String jsonMessage) {
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

        for (WebSocketSession dead : deadSessions) {
            sessions.remove(dead);
            // Also clean from session maps
            String deadId = dead.getId();
            Long taskId = sessionTaskMap.remove(deadId);
            Long planId = sessionPlanMap.remove(deadId);
        }
    }

    /**
     * Extract a Long parameter from WebSocket URI query parameters
     */
    private Long extractParam(WebSocketSession session, String paramName) {
        URI uri = session.getUri();
        if (uri == null) return null;
        try {
            var params = UriComponentsBuilder.fromUri(uri).build().getQueryParams();
            String value = params.getFirst(paramName);
            return value != null ? Long.parseLong(value) : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
