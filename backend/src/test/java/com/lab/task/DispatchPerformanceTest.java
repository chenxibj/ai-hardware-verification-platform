package com.lab.task;

import com.lab.gpu.GpuSlotRepository;
import com.lab.gpu.GpuSlotService;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.chip.ChipRepository;
import com.lab.runspec.RunSpecRepository;
import com.lab.result.EvaluationResultRepository;
import com.lab.chipreport.ReportGeneratorService;
import com.lab.chipreport.ChipReportRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * #492: 调度性能优化测试
 * - Plan 缓存消除 N+1
 * - tryLock 非阻塞
 * - 节点 GPU 预过滤
 * - Recovery 去重
 */
@ExtendWith(MockitoExtension.class)
class DispatchPerformanceTest {

    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private ComputeNodeRepository nodeRepository;
    @Mock private EvaluationPlanRepository planRepository;
    @Mock private ChipRepository chipRepository;
    @Mock private RunSpecRepository runSpecRepository;
    @Mock private GpuSlotService gpuSlotService;
    @Mock private GpuSlotRepository gpuSlotRepository;
    @Mock private EvaluationResultRepository resultRepository;
    @Mock private ReportGeneratorService reportGeneratorService;
    @Mock private ChipReportRepository chipReportRepository;
    @Mock private TaskLifecycleService lifecycle;

    private TaskDispatcher dispatcher;
    private TaskRecoveryScheduler scheduler;

    @BeforeEach
    void setUp() throws Exception {
        dispatcher = new TaskDispatcher(
                taskRepository, nodeRepository, planRepository,
                chipRepository, new ObjectMapper(), runSpecRepository, gpuSlotService);

        // Inject self reference (normally done by Spring @Lazy)
        Field selfField = TaskDispatcher.class.getDeclaredField("self");
        selfField.setAccessible(true);
        selfField.set(dispatcher, dispatcher);

        scheduler = new TaskRecoveryScheduler(
                taskRepository, planRepository, nodeRepository,
                resultRepository, dispatcher,
                gpuSlotService, lifecycle, chipReportRepository, reportGeneratorService);
    }

    // ==================== Test 1: Plan Cache eliminates N+1 ====================

    @Test
    @DisplayName("#492: Plan cache — 100 tasks with same planId should query Plan only once")
    void test_planCacheEliminatesN1() {
        // Setup: 100 QUEUED tasks all with planId=42
        Long planId = 42L;
        EvaluationPlan plan = new EvaluationPlan();
        plan.setId(planId);
        plan.setStatus(EvaluationPlan.PlanStatus.RUNNING);

        List<EvaluationTask> tasks = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            EvaluationTask t = new EvaluationTask();
            t.setId((long) (i + 1));
            t.setTaskNo("TASK-" + i);
            t.setPlanId(planId);
            t.setStatus(EvaluationTask.TaskStatus.QUEUED);
            tasks.add(t);
        }

        // One ONLINE node
        ComputeNode node = new ComputeNode();
        node.setId(1L);
        node.setName("node-1");
        node.setIpAddress("10.0.0.1");
        node.setAgentPort(8090);
        node.setStatus(ComputeNode.Status.ONLINE);

        when(nodeRepository.findByStatus(ComputeNode.Status.ONLINE)).thenReturn(List.of(node));
        when(nodeRepository.findByStatus(ComputeNode.Status.BUSY)).thenReturn(List.of());
        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt()).thenReturn(tasks);
        when(planRepository.findById(planId)).thenReturn(Optional.of(plan));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(gpuSlotService.countFreeSlots(anyLong())).thenReturn(8L);
        when(gpuSlotService.countTotalSlots(anyLong())).thenReturn(8L);
        when(taskRepository.findByStatusAndAssignedNodeId(any(), anyLong())).thenReturn(List.of());

        dispatcher.tryDispatchNext();

        // Key assertion: planRepository.findById should be called at most ONCE for planId=42
        // (not 100 times — N+1 eliminated by cache)
        verify(planRepository, atMost(1)).findById(planId);
    }

    // ==================== Test 2: tryLock non-blocking ====================

    @Test
    @DisplayName("#492: tryLock — concurrent tryDispatchNext returns immediately when lock held")
    void test_tryLockNonBlocking() throws Exception {
        // Access the dispatchLock via reflection
        Field lockField = TaskDispatcher.class.getDeclaredField("dispatchLock");
        lockField.setAccessible(true);
        ReentrantLock lock = (ReentrantLock) lockField.get(dispatcher);

        // Hold the lock from the main thread
        lock.lock();
        try {
            AtomicBoolean completed = new AtomicBoolean(false);
            AtomicBoolean blocked = new AtomicBoolean(false);

            // In another thread, call tryDispatchNext — it should return immediately
            ExecutorService exec = Executors.newSingleThreadExecutor();
            Future<?> future = exec.submit(() -> {
                long start = System.nanoTime();
                dispatcher.tryDispatchNext();
                long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
                completed.set(true);
                // If it took more than 500ms, it was blocking
                if (elapsed > 500) blocked.set(true);
            });

            future.get(2, TimeUnit.SECONDS);
            assertTrue(completed.get(), "tryDispatchNext should complete when lock is held");
            assertFalse(blocked.get(), "tryDispatchNext should NOT block when lock is held (should tryLock and skip)");

            // Verify no repository calls were made (skipped immediately)
            verify(nodeRepository, never()).findByStatus(any());
            exec.shutdown();
        } finally {
            lock.unlock();
        }
    }

    // ==================== Test 3: Node prefilter GPU ====================

    @Test
    @DisplayName("#492: GPU prefilter — tasks needing GPU skip nodes with 0 free GPU slots")
    void test_nodePrefilterGpu() {
        // Two ONLINE nodes: node-1 has 0 free GPU, node-2 has 4 free GPU
        ComputeNode node1 = new ComputeNode();
        node1.setId(1L);
        node1.setName("gpu-busy");
        node1.setIpAddress("10.0.0.1");
        node1.setAgentPort(8090);
        node1.setStatus(ComputeNode.Status.ONLINE);

        ComputeNode node2 = new ComputeNode();
        node2.setId(2L);
        node2.setName("gpu-free");
        node2.setIpAddress("10.0.0.2");
        node2.setAgentPort(8090);
        node2.setStatus(ComputeNode.Status.ONLINE);

        // One QUEUED task, no plan, no chip, no resource pool → priority 3 path
        EvaluationTask task = new EvaluationTask();
        task.setId(100L);
        task.setTaskNo("TASK-GPU-100");
        task.setStatus(EvaluationTask.TaskStatus.QUEUED);
        // No planId, no chipId, no resourcePoolId → falls through to priority 3

        when(nodeRepository.findByStatus(ComputeNode.Status.ONLINE)).thenReturn(List.of(node1, node2));
        when(nodeRepository.findByStatus(ComputeNode.Status.BUSY)).thenReturn(List.of());
        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt()).thenReturn(List.of(task));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // GPU free counts: node1=0, node2=4
        when(gpuSlotService.countFreeSlots(1L)).thenReturn(0L);
        when(gpuSlotService.countTotalSlots(1L)).thenReturn(8L);
        when(gpuSlotService.countFreeSlots(2L)).thenReturn(4L);
        when(gpuSlotService.countTotalSlots(2L)).thenReturn(8L);
        when(taskRepository.findByStatusAndAssignedNodeId(any(), eq(2L))).thenReturn(List.of());

        dispatcher.tryDispatchNext();

        // Task should be dispatched to node-2 (the one with free GPU)
        assertEquals(EvaluationTask.TaskStatus.DISPATCHED, task.getStatus());
        assertEquals(2L, task.getAssignedNodeId());
    }

    // ==================== Test 4: Recovery dedup ====================

    @Test
    @DisplayName("#492: Recovery dedup — same task appearing twice should only be processed once")
    void test_recoveryDedup() {
        Instant staleTime = Instant.now().minus(20, ChronoUnit.MINUTES);
        Instant threshold5 = Instant.now().minus(6, ChronoUnit.MINUTES);

        // Create a task that appears in BOTH the 15min and 5min queries
        EvaluationTask task = new EvaluationTask();
        task.setId(1L);
        task.setTaskNo("TASK-DUP-1");
        task.setStatus(EvaluationTask.TaskStatus.RUNNING);
        task.setLastHeartbeatAt(staleTime);
        task.setProgress(0);  // progress=0 → matches both 15min and 5min criteria
        task.setAssignedNodeId(1L);

        // 15min query returns this task
        when(taskRepository.findByStatusAndLastHeartbeatAtBefore(
                eq(EvaluationTask.TaskStatus.RUNNING), any(Instant.class)))
                .thenReturn(List.of(task))   // 15min threshold
                .thenReturn(List.of(task));   // 5min threshold (same task!)
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        scheduler.recoverStaleRunningTasks();

        // Task should be processed exactly once (saved once, not twice)
        verify(taskRepository, times(1)).save(task);
        // #509: progress=0 tasks are re-queued (not failed) on first retry
        assertEquals(EvaluationTask.TaskStatus.QUEUED, task.getStatus());
    }
}
