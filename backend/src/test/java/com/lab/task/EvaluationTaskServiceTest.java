package com.lab.task;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EvaluationTaskServiceTest {

    @Mock
    private EvaluationTaskRepository taskRepository;

    @InjectMocks
    private EvaluationTaskService taskService;

    private EvaluationTask sampleTask;
    private CreateTaskRequest sampleRequest;

    @BeforeEach
    void setUp() {
        sampleTask = new EvaluationTask();
        sampleTask.setId(1L);
        sampleTask.setTaskNo("TASK-1234567890-001");
        sampleTask.setTaskType(EvaluationTask.TaskType.TEMPLATE);
        sampleTask.setEvalType(EvaluationTask.EvalType.OPERATOR);
        sampleTask.setStatus(EvaluationTask.TaskStatus.PENDING);
        sampleTask.setPriority(EvaluationTask.Priority.MEDIUM);
        sampleTask.setEvalConfig("{\"type\":\"operator\"}");
        sampleTask.setProgress(0);
        sampleTask.setCreatedBy(100L);

        sampleRequest = new CreateTaskRequest();
        sampleRequest.setTaskType(EvaluationTask.TaskType.TEMPLATE);
        sampleRequest.setEvalType(EvaluationTask.EvalType.OPERATOR);
        sampleRequest.setPriority(EvaluationTask.Priority.MEDIUM);
        sampleRequest.setEvalConfig("{\"type\":\"operator\"}");
        sampleRequest.setDatasetIds(new Long[]{1L, 2L});
        sampleRequest.setResourceSpec("{\"cpu\":4}");
    }

    // --- createTask ---

    @Test
    @DisplayName("创建任务 - 默认状态为 PENDING，progress=0")
    void createTask_shouldSetDefaultValues() {
        when(taskRepository.save(any(EvaluationTask.class))).thenAnswer(inv -> {
            EvaluationTask t = inv.getArgument(0);
            t.setId(1L);
            return t;
        });

        EvaluationTask result = taskService.createTask(sampleRequest, 100L);

        assertNotNull(result);
        assertEquals(EvaluationTask.TaskStatus.PENDING, result.getStatus());
        assertEquals(0, result.getProgress());
        assertEquals(100L, result.getCreatedBy());
        assertNotNull(result.getTaskNo());
        assertTrue(result.getTaskNo().startsWith("TASK-"));
        verify(taskRepository).save(any(EvaluationTask.class));
    }

    @Test
    @DisplayName("创建任务 - taskNo 格式正确")
    void createTask_shouldGenerateValidTaskNo() {
        when(taskRepository.save(any(EvaluationTask.class))).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.createTask(sampleRequest, 100L);

        assertNotNull(result.getTaskNo());
        assertTrue(result.getTaskNo().matches("TASK-\\d+-\\d{3}"));
    }

    @Test
    @DisplayName("创建任务 - 正确设置请求中的字段")
    void createTask_shouldSetFieldsFromRequest() {
        when(taskRepository.save(any(EvaluationTask.class))).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.createTask(sampleRequest, 100L);

        assertEquals(EvaluationTask.TaskType.TEMPLATE, result.getTaskType());
        assertEquals(EvaluationTask.EvalType.OPERATOR, result.getEvalType());
        assertEquals(EvaluationTask.Priority.MEDIUM, result.getPriority());
        assertEquals("{\"type\":\"operator\"}", result.getEvalConfig());
        assertEquals(Arrays.asList(1L, 2L), result.getDatasetIds());
        assertEquals("{\"cpu\":4}", result.getResourceSpec());
    }

    // --- updateTaskStatus ---

    @Test
    @DisplayName("状态流转 - PENDING → RUNNING 设置 startedAt")
    void updateStatus_pendingToRunning_setsStartedAt() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.PENDING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.updateTaskStatus(1L, EvaluationTask.TaskStatus.RUNNING, null);

        assertEquals(EvaluationTask.TaskStatus.RUNNING, result.getStatus());
        assertNotNull(result.getStartedAt());
    }

    @Test
    @DisplayName("状态流转 - RUNNING → COMPLETED 设置 completedAt 和 progress=100")
    void updateStatus_runningToCompleted_setsCompletedAtAndProgress() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.RUNNING);
        sampleTask.setStartedAt(Instant.now());
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.updateTaskStatus(1L, EvaluationTask.TaskStatus.COMPLETED, null);

        assertEquals(EvaluationTask.TaskStatus.COMPLETED, result.getStatus());
        assertNotNull(result.getCompletedAt());
        assertEquals(100, result.getProgress());
    }

    @Test
    @DisplayName("状态流转 - RUNNING → FAILED 设置 completedAt 和 progress=100")
    void updateStatus_runningToFailed_setsCompletedAt() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.RUNNING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.updateTaskStatus(1L, EvaluationTask.TaskStatus.FAILED, "error");

        assertEquals(EvaluationTask.TaskStatus.FAILED, result.getStatus());
        assertNotNull(result.getCompletedAt());
    }

    @Test
    @DisplayName("状态流转 - 任务不存在抛异常")
    void updateStatus_taskNotFound_throwsException() {
        when(taskRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(RuntimeException.class, () ->
                taskService.updateTaskStatus(999L, EvaluationTask.TaskStatus.RUNNING, null));
    }

    // --- cancelTask ---

    @Test
    @DisplayName("取消任务 - PENDING 状态可以取消")
    void cancelTask_pendingStatus_success() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.PENDING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.cancelTask(1L, 100L);

        assertEquals(EvaluationTask.TaskStatus.CANCELLED, result.getStatus());
    }

    @Test
    @DisplayName("取消任务 - RUNNING 状态可以取消")
    void cancelTask_runningStatus_success() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.RUNNING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.cancelTask(1L, 100L);

        assertEquals(EvaluationTask.TaskStatus.CANCELLED, result.getStatus());
    }

    @Test
    @DisplayName("取消任务 - COMPLETED 状态不能取消")
    void cancelTask_completedStatus_throwsException() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.COMPLETED);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        assertThrows(RuntimeException.class, () -> taskService.cancelTask(1L, 100L));
    }

    @Test
    @DisplayName("取消任务 - CANCELLED 状态不能再次取消")
    void cancelTask_cancelledStatus_throwsException() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.CANCELLED);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        assertThrows(RuntimeException.class, () -> taskService.cancelTask(1L, 100L));
    }

    @Test
    @DisplayName("取消任务 - 非本人不能取消")
    void cancelTask_wrongUser_throwsException() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.PENDING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        assertThrows(RuntimeException.class, () -> taskService.cancelTask(1L, 999L));
    }

    // --- retryTask ---

    @Test
    @DisplayName("重试任务 - FAILED 状态可以重试")
    void retryTask_failedStatus_success() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.FAILED);
        sampleTask.setProgress(50);
        sampleTask.setStartedAt(Instant.now());
        sampleTask.setCompletedAt(Instant.now());
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.retryTask(1L, 100L);

        assertEquals(EvaluationTask.TaskStatus.PENDING, result.getStatus());
        assertEquals(0, result.getProgress());
        assertNull(result.getStartedAt());
        assertNull(result.getCompletedAt());
    }

    @Test
    @DisplayName("重试任务 - CANCELLED 状态可以重试")
    void retryTask_cancelledStatus_success() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.CANCELLED);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.retryTask(1L, 100L);

        assertEquals(EvaluationTask.TaskStatus.PENDING, result.getStatus());
    }

    @Test
    @DisplayName("重试任务 - PENDING 状态不能重试")
    void retryTask_pendingStatus_throwsException() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.PENDING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        assertThrows(RuntimeException.class, () -> taskService.retryTask(1L, 100L));
    }

    @Test
    @DisplayName("重试任务 - RUNNING 状态不能重试")
    void retryTask_runningStatus_throwsException() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.RUNNING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        assertThrows(RuntimeException.class, () -> taskService.retryTask(1L, 100L));
    }

    @Test
    @DisplayName("重试任务 - 非本人不能重试")
    void retryTask_wrongUser_throwsException() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.FAILED);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        assertThrows(RuntimeException.class, () -> taskService.retryTask(1L, 999L));
    }

    // --- pauseTask ---

    @Test
    @DisplayName("暂停任务 - RUNNING 状态可以暂停")
    void pauseTask_runningStatus_success() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.RUNNING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.pauseTask(1L, 100L);

        assertEquals(EvaluationTask.TaskStatus.PAUSED, result.getStatus());
    }

    @Test
    @DisplayName("暂停任务 - PENDING 状态可以暂停")
    void pauseTask_pendingStatus_success() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.PENDING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.pauseTask(1L, 100L);

        assertEquals(EvaluationTask.TaskStatus.PAUSED, result.getStatus());
    }

    @Test
    @DisplayName("暂停任务 - COMPLETED 状态不能暂停")
    void pauseTask_completedStatus_throwsException() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.COMPLETED);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        assertThrows(RuntimeException.class, () -> taskService.pauseTask(1L, 100L));
    }

    @Test
    @DisplayName("暂停任务 - FAILED 状态不能暂停")
    void pauseTask_failedStatus_throwsException() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.FAILED);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        assertThrows(RuntimeException.class, () -> taskService.pauseTask(1L, 100L));
    }

    // --- resumeTask ---

    @Test
    @DisplayName("恢复任务 - PAUSED 状态可以恢复")
    void resumeTask_pausedStatus_success() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.PAUSED);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EvaluationTask result = taskService.resumeTask(1L, 100L);

        assertEquals(EvaluationTask.TaskStatus.PENDING, result.getStatus());
    }

    @Test
    @DisplayName("恢复任务 - RUNNING 状态不能恢复")
    void resumeTask_runningStatus_throwsException() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.RUNNING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        assertThrows(RuntimeException.class, () -> taskService.resumeTask(1L, 100L));
    }

    @Test
    @DisplayName("恢复任务 - PENDING 状态不能恢复（本就不是暂停）")
    void resumeTask_pendingStatus_throwsException() {
        sampleTask.setStatus(EvaluationTask.TaskStatus.PENDING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        assertThrows(RuntimeException.class, () -> taskService.resumeTask(1L, 100L));
    }

    // --- listTasks ---

    @Test
    @DisplayName("查询任务列表 - 按 userId 和 status 过滤")
    void listTasks_withUserIdAndStatus() {
        Pageable pageable = PageRequest.of(0, 10);
        Page<EvaluationTask> page = new PageImpl<>(List.of(sampleTask));
        when(taskRepository.findByUserIdAndStatus(100L, EvaluationTask.TaskStatus.PENDING, pageable)).thenReturn(page);

        Page<EvaluationTask> result = taskService.listTasks(100L, null, null, EvaluationTask.TaskStatus.PENDING, pageable);

        assertEquals(1, result.getTotalElements());
    }

    @Test
    @DisplayName("查询任务列表 - 只按 userId 过滤")
    void listTasks_withUserIdOnly() {
        Pageable pageable = PageRequest.of(0, 10);
        Page<EvaluationTask> page = new PageImpl<>(List.of(sampleTask));
        when(taskRepository.findByCreatedBy(100L, pageable)).thenReturn(page);

        Page<EvaluationTask> result = taskService.listTasks(100L, null, null, null, pageable);

        assertEquals(1, result.getTotalElements());
    }

    @Test
    @DisplayName("查询任务列表 - 只按 status 过滤")
    void listTasks_withStatusOnly() {
        Pageable pageable = PageRequest.of(0, 10);
        Page<EvaluationTask> page = new PageImpl<>(List.of(sampleTask));
        when(taskRepository.findByStatus(EvaluationTask.TaskStatus.PENDING, pageable)).thenReturn(page);

        Page<EvaluationTask> result = taskService.listTasks(null, null, null, EvaluationTask.TaskStatus.PENDING, pageable);

        assertEquals(1, result.getTotalElements());
    }

    @Test
    @DisplayName("查询任务列表 - 无过滤条件返回全部")
    void listTasks_noFilter() {
        Pageable pageable = PageRequest.of(0, 10);
        Page<EvaluationTask> page = new PageImpl<>(List.of(sampleTask));
        when(taskRepository.findAll(pageable)).thenReturn(page);

        Page<EvaluationTask> result = taskService.listTasks(null, null, null, null, pageable);

        assertEquals(1, result.getTotalElements());
    }

    // --- getTaskDetail ---

    @Test
    @DisplayName("查询任务详情 - 存在")
    void getTaskDetail_exists() {
        when(taskRepository.findById(1L)).thenReturn(Optional.of(sampleTask));

        Optional<EvaluationTask> result = taskService.getTaskDetail(1L);

        assertTrue(result.isPresent());
        assertEquals("TASK-1234567890-001", result.get().getTaskNo());
    }

    @Test
    @DisplayName("查询任务详情 - 不存在")
    void getTaskDetail_notFound() {
        when(taskRepository.findById(999L)).thenReturn(Optional.empty());

        Optional<EvaluationTask> result = taskService.getTaskDetail(999L);

        assertFalse(result.isPresent());
    }

    // --- getTaskByTaskNo ---

    @Test
    @DisplayName("按任务编号查询")
    void getTaskByTaskNo() {
        when(taskRepository.findByTaskNo("TASK-1234567890-001")).thenReturn(Optional.of(sampleTask));

        Optional<EvaluationTask> result = taskService.getTaskByTaskNo("TASK-1234567890-001");

        assertTrue(result.isPresent());
    }
}
