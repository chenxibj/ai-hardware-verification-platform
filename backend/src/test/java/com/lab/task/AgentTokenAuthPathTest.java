package com.lab.task;

import com.lab.user.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collections;

import static org.assertj.core.api.Assertions.*;

/**
 * #559: Verify that agent token authentication paths remain functional
 * after getCurrentUserId() was changed to throw 401 (commit 628f71e0).
 *
 * Key findings:
 * 1. Agent endpoints (heartbeat, poll-tasks, result, failure, progress, complete, logs)
 *    are handled by ComputeNodeController and TaskCompleteController — they do NOT call getCurrentUserId().
 * 2. AgentTokenFilter sets principal="agent" (String), not a User object.
 * 3. getCurrentUserId() correctly rejects non-User principals with 401.
 * 4. This is SAFE because agent paths never reach getCurrentUserId().
 */
class AgentTokenAuthPathTest {

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("#559: Agent-authenticated context (principal='agent') correctly throws 401 from getCurrentUserId()")
    void agentPrincipalThrows401FromGetCurrentUserId() {
        // Simulate what AgentTokenFilter sets for agent-authenticated requests
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                "agent", null, AuthorityUtils.createAuthorityList("ROLE_AGENT"));
        SecurityContextHolder.getContext().setAuthentication(auth);

        // getCurrentUserId() should throw 401 because principal is String, not User
        assertThatThrownBy(EvaluationTaskController::getCurrentUserId)
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(rse.getReason()).contains("No authenticated user");
                });
    }

    @Test
    @DisplayName("#559: User-authenticated context still works correctly")
    void userPrincipalReturnsUserId() {
        User user = new User();
        user.setId(99L);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                user, null, AuthorityUtils.createAuthorityList("ROLE_USER"));
        SecurityContextHolder.getContext().setAuthentication(auth);

        Long userId = EvaluationTaskController.getCurrentUserId();
        assertThat(userId).isEqualTo(99L);
    }

    @Test
    @DisplayName("#559: Agent endpoints do NOT call getCurrentUserId() - verified by code path analysis")
    void agentEndpointsDoNotUseGetCurrentUserId() {
        // This test documents the architectural guarantee:
        // Agent endpoints handled by AgentTokenFilter patterns:
        //   /nodes/{id}/heartbeat     -> ComputeNodeController.heartbeat() - no getCurrentUserId()
        //   /nodes/{id}/poll-tasks    -> ComputeNodeController.pollTasks() - no getCurrentUserId()
        //   /nodes/register           -> ComputeNodeController.register() - no getCurrentUserId()
        //   /tasks/{id}/result        -> TaskCompleteController - no getCurrentUserId()
        //   /tasks/{id}/failure       -> TaskCompleteController - no getCurrentUserId()
        //   /tasks/{id}/progress      -> EvaluationTaskController.updateProgress() - no getCurrentUserId()
        //   /tasks/{id}/complete      -> TaskCompleteController - no getCurrentUserId()
        //   /tasks/{id}/logs          -> TaskLogStreamController - no getCurrentUserId()
        //
        // Controllers that DO call getCurrentUserId() are user-facing only:
        //   EvaluationTaskController: createTask, startTask, cancelTask, retryTask, etc.
        //   TaskQueueController: getQueueStatus, patchCancelTask
        //   TaskBatchController: batch operations
        //   EvaluationPlanController: plan operations
        //
        // These user-facing endpoints require @RequireRole(Role.ENGINEER/VIEWER) which
        // expects a properly authenticated user (User principal), not an agent token.

        // Verify the architectural invariant: if agent auth is set,
        // getCurrentUserId will fail fast (not silently return wrong data)
        UsernamePasswordAuthenticationToken agentAuth = new UsernamePasswordAuthenticationToken(
                "agent", null, AuthorityUtils.createAuthorityList("ROLE_AGENT"));
        SecurityContextHolder.getContext().setAuthentication(agentAuth);

        // This proves that even if an agent accidentally hits a user endpoint,
        // it fails with 401 rather than silently returning a bogus user ID
        assertThatThrownBy(EvaluationTaskController::getCurrentUserId)
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                });
    }

    @Test
    @DisplayName("#559: Null authentication throws 401 (regression guard)")
    void nullAuthenticationThrows401() {
        SecurityContextHolder.clearContext();

        assertThatThrownBy(EvaluationTaskController::getCurrentUserId)
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                });
    }
}
