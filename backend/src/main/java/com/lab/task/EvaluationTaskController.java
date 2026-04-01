package com.lab.task;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@RestController @RequestMapping("/tasks") @RequiredArgsConstructor
public class EvaluationTaskController {
    private final EvaluationTaskRepository taskRepository;

    @PostMapping
    public ResponseEntity<Map<String,Object>> create(@RequestBody CreateTaskRequest req, @AuthenticationPrincipal User user) {
        EvaluationTask t = new EvaluationTask();
        t.setTaskNo("EVT-" + Instant.now().getEpochSecond() + "-" + String.format("%03d",(int)(Math.random()*1000)));
        t.setName(req.getName()); t.setDescription(req.getDescription());
        t.setEvalType(req.getEvalType()!=null?req.getEvalType():"GENERAL");
        t.setTargetModel(req.getTargetModel()); t.setDatasetIds(req.getDatasetIds());
        t.setStatus("PENDING"); t.setCreatedBy(user.getId()); t.setPriority(req.getPriority()!=null?req.getPriority():"MEDIUM");
        t.setTags(req.getTags());
        return ResponseEntity.ok(Map.of("code",0,"data",taskRepository.save(t)));
    }

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@RequestParam(required=false) String status, @RequestParam(required=false) String evalType,
            @RequestParam(required=false) String keyword, @RequestParam(required=false) String priority,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size,
            @RequestParam(defaultValue="createdAt") String sortBy, @RequestParam(defaultValue="desc") String sortDir) {
        var sort = "asc".equalsIgnoreCase(sortDir) ? Sort.by(Sort.Direction.ASC, sortBy) : Sort.by(Sort.Direction.DESC, sortBy);
        Page<EvaluationTask> tasks;
        if (status!=null) tasks = taskRepository.findByStatus(status, PageRequest.of(page,size,sort));
        else if (evalType!=null) tasks = taskRepository.findByEvalType(evalType, PageRequest.of(page,size,sort));
        else if (keyword!=null) tasks = taskRepository.findByNameContaining(keyword, PageRequest.of(page,size,sort));
        else tasks = taskRepository.findAll(PageRequest.of(page,size,sort));
        Map<String,Object> res = new HashMap<>();
        res.put("code",0); res.put("data",tasks.getContent()); res.put("total",tasks.getTotalElements()); res.put("page",page); res.put("size",size);
        return ResponseEntity.ok(res);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> get(@PathVariable Long id) {
        return taskRepository.findById(id).map(t->ResponseEntity.ok(Map.<String,Object>of("code",0,"data",t))).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String,Object>> update(@PathVariable Long id, @RequestBody Map<String,Object> body) {
        EvaluationTask t = taskRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        if(body.containsKey("name")) t.setName((String)body.get("name"));
        if(body.containsKey("description")) t.setDescription((String)body.get("description"));
        if(body.containsKey("priority")) t.setPriority((String)body.get("priority"));
        if(body.containsKey("tags")) t.setTags((String)body.get("tags"));
        return ResponseEntity.ok(Map.of("code",0,"data",taskRepository.save(t)));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<Map<String,Object>> cancel(@PathVariable Long id) {
        EvaluationTask t = taskRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        t.setStatus("CANCELLED"); return ResponseEntity.ok(Map.of("code",0,"data",taskRepository.save(t)));
    }

    @PostMapping("/{id}/retry")
    public ResponseEntity<Map<String,Object>> retry(@PathVariable Long id) {
        EvaluationTask t = taskRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        t.setStatus("PENDING"); t.setErrorMessage(null); return ResponseEntity.ok(Map.of("code",0,"data",taskRepository.save(t)));
    }

    @PostMapping("/{id}/clone")
    public ResponseEntity<Map<String,Object>> clone(@PathVariable Long id, @AuthenticationPrincipal User user) {
        EvaluationTask orig = taskRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        EvaluationTask clone = new EvaluationTask();
        clone.setTaskNo("EVT-" + Instant.now().getEpochSecond() + "-" + String.format("%03d",(int)(Math.random()*1000)));
        clone.setName(orig.getName() + " (副本)"); clone.setDescription(orig.getDescription());
        clone.setEvalType(orig.getEvalType()); clone.setTargetModel(orig.getTargetModel());
        clone.setDatasetIds(orig.getDatasetIds()); clone.setStatus("PENDING");
        clone.setCreatedBy(user.getId()); clone.setPriority(orig.getPriority()); clone.setTags(orig.getTags());
        return ResponseEntity.ok(Map.of("code",0,"data",taskRepository.save(clone)));
    }

    @PostMapping("/batch/cancel")
    public ResponseEntity<Map<String,Object>> batchCancel(@RequestBody Map<String,List<Long>> body) {
        List<Long> ids = body.get("ids");
        int count = 0;
        for (Long id : ids) {
            taskRepository.findById(id).ifPresent(t -> { t.setStatus("CANCELLED"); taskRepository.save(t); });
            count++;
        }
        return ResponseEntity.ok(Map.of("code",0,"message","批量取消 "+count+" 个任务"));
    }

    @PostMapping("/batch/delete")
    public ResponseEntity<Map<String,Object>> batchDelete(@RequestBody Map<String,List<Long>> body) {
        List<Long> ids = body.get("ids");
        taskRepository.deleteAllById(ids);
        return ResponseEntity.ok(Map.of("code",0,"message","批量删除 "+ids.size()+" 个任务"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String,Object>> delete(@PathVariable Long id) {
        taskRepository.deleteById(id); return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String,Object>> stats() {
        return ResponseEntity.ok(Map.of("code",0,"data",Map.of(
            "total", taskRepository.count(),
            "pending", taskRepository.countByStatus("PENDING"),
            "running", taskRepository.countByStatus("RUNNING"),
            "completed", taskRepository.countByStatus("COMPLETED"),
            "failed", taskRepository.countByStatus("FAILED"),
            "cancelled", taskRepository.countByStatus("CANCELLED")
        )));
    }
}
