package com.lab.log;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/logs") @RequiredArgsConstructor
public class LogController {
    private final EvalLogRepository logRepository;

    @PostMapping
    public ResponseEntity<Map<String,Object>> create(@RequestBody Map<String,Object> body) {
        EvalLog log = new EvalLog();
        log.setTaskId(body.get("taskId")!=null?Long.valueOf(body.get("taskId").toString()):null);
        log.setLogLevel((String)body.getOrDefault("logLevel","INFO"));
        log.setMessage((String)body.get("message"));
        log.setSource((String)body.get("source"));
        log.setStepName((String)body.get("stepName"));
        return ResponseEntity.ok(Map.of("code",0,"data",logRepository.save(log)));
    }

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@RequestParam(required=false) Long taskId, @RequestParam(required=false) String logLevel,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="50") int size) {
        Page<EvalLog> logs;
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        if (taskId!=null && logLevel!=null) logs = logRepository.findByTaskIdAndLogLevel(taskId, logLevel, pageable);
        else if (taskId!=null) logs = logRepository.findByTaskId(taskId, pageable);
        else if (logLevel!=null) logs = logRepository.findByLogLevel(logLevel, pageable);
        else logs = logRepository.findAll(pageable);
        Map<String,Object> res = new HashMap<>();
        res.put("code",0); res.put("data",logs.getContent()); res.put("total",logs.getTotalElements());
        return ResponseEntity.ok(res);
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String,Object>> stats(@RequestParam(required=false) Long taskId) {
        Map<String,Object> data = new HashMap<>();
        data.put("total", taskId!=null?logRepository.countByTaskId(taskId):logRepository.count());
        data.put("errors", logRepository.countByLogLevel("ERROR"));
        data.put("warnings", logRepository.countByLogLevel("WARN"));
        return ResponseEntity.ok(Map.of("code",0,"data",data));
    }
}
