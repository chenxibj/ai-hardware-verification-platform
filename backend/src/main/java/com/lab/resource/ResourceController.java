package com.lab.resource;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/resources") @RequiredArgsConstructor
public class ResourceController {
    private final ResourceRepository resourceRepository;

    @PostMapping
    public ResponseEntity<Map<String,Object>> create(@RequestBody Map<String,Object> body, @AuthenticationPrincipal User user) {
        ComputeResource r = new ComputeResource();
        r.setResourceNo("RES-" + Instant.now().getEpochSecond() + "-" + String.format("%03d",(int)(Math.random()*1000)));
        r.setName((String)body.get("name")); r.setResourceType((String)body.get("resourceType"));
        r.setModel((String)body.get("model")); r.setVendor((String)body.get("vendor"));
        r.setTotalCount(body.get("totalCount")!=null?Integer.parseInt(body.get("totalCount").toString()):1);
        r.setAvailableCount(r.getTotalCount()); r.setStatus("ONLINE");
        r.setPoolName((String)body.get("poolName")); r.setSpecs(body.get("specs")!=null?body.get("specs").toString():null);
        r.setCreatedBy(user.getId());
        return ResponseEntity.ok(Map.of("code",0,"data",resourceRepository.save(r)));
    }

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@RequestParam(required=false) String resourceType, @RequestParam(required=false) String status,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        Page<ComputeResource> resources;
        if (resourceType!=null) resources = resourceRepository.findByResourceType(resourceType, PageRequest.of(page,size));
        else if (status!=null) resources = resourceRepository.findByStatus(status, PageRequest.of(page,size));
        else resources = resourceRepository.findAll(PageRequest.of(page,size));
        Map<String,Object> res = new HashMap<>();
        res.put("code",0); res.put("data",resources.getContent()); res.put("total",resources.getTotalElements());
        return ResponseEntity.ok(res);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> get(@PathVariable Long id) {
        return resourceRepository.findById(id).map(r->ResponseEntity.ok(Map.<String,Object>of("code",0,"data",r))).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<Map<String,Object>> updateStatus(@PathVariable Long id, @RequestBody Map<String,String> body) {
        ComputeResource r = resourceRepository.findById(id).orElseThrow(()->new RuntimeException("Not found"));
        r.setStatus(body.get("status")); resourceRepository.save(r);
        return ResponseEntity.ok(Map.of("code",0,"data",r));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String,Object>> delete(@PathVariable Long id) {
        resourceRepository.deleteById(id); return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String,Object>> stats() {
        return ResponseEntity.ok(Map.of("code",0,"data",Map.of(
            "total", resourceRepository.count(),
            "gpus", resourceRepository.countByResourceType("GPU"),
            "cpus", resourceRepository.countByResourceType("CPU"),
            "npus", resourceRepository.countByResourceType("NPU"),
            "online", resourceRepository.countByStatus("ONLINE"),
            "offline", resourceRepository.countByStatus("OFFLINE"),
            "totalDevices", resourceRepository.sumTotalCount(),
            "availableDevices", resourceRepository.sumAvailableCount()
        )));
    }
}
