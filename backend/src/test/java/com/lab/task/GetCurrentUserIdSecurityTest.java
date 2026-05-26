package com.lab.task;

import com.lab.user.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collections;

import static org.assertj.core.api.Assertions.*;

/**
 * Tests for Issue #555: getCurrentUserId() must reject unauthenticated requests
 * instead of returning hardcoded 1L.
 */
class GetCurrentUserIdSecurityTest {

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("#555: throws 401 when SecurityContext has no authentication")
    void shouldThrow401WhenNoAuthentication() {
        SecurityContextHolder.clearContext();

        assertThatThrownBy(EvaluationTaskController::getCurrentUserId)
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                });
    }

    @Test
    @DisplayName("#555: throws 401 when principal is not a User instance")
    void shouldThrow401WhenPrincipalIsNotUser() {
        // Principal is a plain String (e.g., "anonymousUser")
        var auth = new UsernamePasswordAuthenticationToken("anonymousUser", null, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThatThrownBy(EvaluationTaskController::getCurrentUserId)
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                });
    }

    @Test
    @DisplayName("#555: returns user ID when properly authenticated")
    void shouldReturnUserIdWhenAuthenticated() {
        User user = new User();
        user.setId(42L);
        var auth = new UsernamePasswordAuthenticationToken(user, null, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(auth);

        Long result = EvaluationTaskController.getCurrentUserId();

        assertThat(result).isEqualTo(42L);
    }

    @Test
    @DisplayName("#555: never returns hardcoded 1L for unauthenticated requests")
    void shouldNeverReturnHardcoded1L() {
        SecurityContextHolder.clearContext();

        assertThatThrownBy(EvaluationTaskController::getCurrentUserId)
                .isInstanceOf(ResponseStatusException.class)
                .withFailMessage("getCurrentUserId() must not silently return 1L for unauthenticated requests");
    }
}
