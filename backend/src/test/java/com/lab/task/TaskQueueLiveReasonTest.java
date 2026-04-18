package com.lab.task;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #486: Test the queueReason live-computation logic.
 * Pure unit tests (no mocking of Spring beans) — test the algorithm directly.
 */
class TaskQueueLiveReasonTest {

    /**
     * Reference implementation of the live queueReason computation.
     * This will be extracted into a utility or inlined in the controller.
     */
    static String computeFreshQueueReason(
            String originalReason,
            Long nodeId,
            Long runSpecId,
            Integer gpuPerNode,  // from RunSpec lookup (null if not found)
            Long freeSlots,      // current free slots on node
            Long totalSlots) {   // total slots on node

        if (nodeId == null) {
            return originalReason;
        }

        if (gpuPerNode != null && gpuPerNode > 0) {
            return String.format("waiting for GPU resources (%d/%d free, need %d)",
                    freeSlots, totalSlots, gpuPerNode);
        } else {
            return String.format("waiting for GPU resources (%d/%d free)",
                    freeSlots, totalSlots);
        }
    }

    @Test
    @DisplayName("#486: queueReason includes real-time GPU free/total/needed info")
    void testQueueReasonIncludesLiveGpuInfo() {
        String freshReason = computeFreshQueueReason(
                "old stale reason", 1L, 10L,
                4,    // gpuPerNode from RunSpec
                2L,   // 2 free slots
                8L    // 8 total slots
        );

        assertNotNull(freshReason);
        assertTrue(freshReason.contains("2"), "Should contain free slot count (2): " + freshReason);
        assertTrue(freshReason.contains("8"), "Should contain total slot count (8): " + freshReason);
        assertTrue(freshReason.contains("4"), "Should contain needed GPU count (4): " + freshReason);
        assertNotEquals("old stale reason", freshReason);
    }

    @Test
    @DisplayName("#486: queueReason falls back to original when no node assigned")
    void testQueueReasonFallbackWhenNoNode() {
        String freshReason = computeFreshQueueReason(
                "waiting for available node",
                null,  // no node
                null, null, 0L, 0L
        );

        assertEquals("waiting for available node", freshReason);
    }

    @Test
    @DisplayName("#486: queueReason with node but no RunSpec shows free/total only")
    void testQueueReasonWithNodeButNoRunSpec() {
        String freshReason = computeFreshQueueReason(
                "original reason",
                2L,    // node assigned
                null,  // no runSpecId
                null,  // no gpuPerNode
                0L,    // 0 free
                8L     // 8 total
        );

        assertTrue(freshReason.contains("0") && freshReason.contains("8"),
                "Should show free/total: " + freshReason);
        assertFalse(freshReason.contains("need"),
                "Should not mention need when RunSpec is unavailable: " + freshReason);
    }

    @Test
    @DisplayName("#486: queueReason when all GPUs are free")
    void testQueueReasonAllFree() {
        String freshReason = computeFreshQueueReason(
                "stale", 1L, 10L, 2, 8L, 8L
        );

        assertTrue(freshReason.contains("8/8 free"),
                "Should show 8/8 free: " + freshReason);
        assertTrue(freshReason.contains("need 2"),
                "Should show need 2: " + freshReason);
    }
}
