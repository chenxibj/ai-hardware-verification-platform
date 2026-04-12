package com.lab.allocation;

import com.lab.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * #399: 任务节点分配 API
 */
@RestController
@RequestMapping("/tasks")
public class TaskNodeAllocationController {

    private final TaskNodeAllocationRepository repo;

    public TaskNodeAllocationController(TaskNodeAllocationRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/{taskId}/allocations")
    public ApiResponse<List<TaskNodeAllocation>> getTaskAllocations(@PathVariable Long taskId) {
        return ApiResponse.ok(repo.findByTaskIdOrderByNodeRank(taskId));
    }
}
