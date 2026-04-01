package com.lab.asset;
import com.lab.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/assets") @RequiredArgsConstructor
public class AssetController {
    private final AssetRepository assetRepository;

    @PostMapping
    public ResponseEntity<Map<String,Object>> create(@RequestBody Map<String,Object> body, @AuthenticationPrincipal User user) {
        DigitalAsset asset = new DigitalAsset();
        asset.setAssetNo("AST-" + Instant.now().getEpochSecond() + "-" + String.format("%03d",(int)(Math.random()*1000)));
        asset.setName((String)body.get("name"));
        asset.setAssetType((String)body.get("assetType"));
        asset.setDescription((String)body.get("description"));
        asset.setVersion((String)body.getOrDefault("version","1.0"));
        asset.setStatus("ACTIVE");
        asset.setTags(body.get("tags")!=null?body.get("tags").toString():null);
        asset.setMetadata(body.get("metadata")!=null?body.get("metadata").toString():null);
        asset.setCreatedBy(user.getId());
        return ResponseEntity.ok(Map.of("code",0,"message","success","data",assetRepository.save(asset)));
    }

    @GetMapping
    public ResponseEntity<Map<String,Object>> list(@RequestParam(required=false) String assetType, @RequestParam(required=false) String keyword,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        Page<DigitalAsset> assets;
        if (keyword!=null&&!keyword.isBlank()) assets = assetRepository.findByNameContaining(keyword, PageRequest.of(page,size));
        else if (assetType!=null) assets = assetRepository.findByAssetType(assetType, PageRequest.of(page,size));
        else assets = assetRepository.findByStatus("ACTIVE", PageRequest.of(page,size));
        Map<String,Object> res = new HashMap<>();
        res.put("code",0); res.put("data",assets.getContent()); res.put("total",assets.getTotalElements()); res.put("page",page); res.put("size",size);
        return ResponseEntity.ok(res);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> get(@PathVariable Long id) {
        return assetRepository.findById(id).map(a -> ResponseEntity.ok(Map.<String,Object>of("code",0,"data",a))).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String,Object>> update(@PathVariable Long id, @RequestBody Map<String,Object> body) {
        DigitalAsset asset = assetRepository.findById(id).orElseThrow(()->new RuntimeException("Asset not found"));
        if(body.containsKey("name")) asset.setName((String)body.get("name"));
        if(body.containsKey("description")) asset.setDescription((String)body.get("description"));
        if(body.containsKey("version")) asset.setVersion((String)body.get("version"));
        if(body.containsKey("status")) asset.setStatus((String)body.get("status"));
        return ResponseEntity.ok(Map.of("code",0,"data",assetRepository.save(asset)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String,Object>> delete(@PathVariable Long id) {
        DigitalAsset asset = assetRepository.findById(id).orElseThrow(()->new RuntimeException("Asset not found"));
        asset.setStatus("DELETED");
        assetRepository.save(asset);
        return ResponseEntity.ok(Map.of("code",0,"message","success"));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String,Object>> stats() {
        return ResponseEntity.ok(Map.of("code",0,"data",Map.of(
            "total",assetRepository.count(),
            "models",assetRepository.countByAssetType("MODEL"),
            "datasets",assetRepository.countByAssetType("DATASET"),
            "scripts",assetRepository.countByAssetType("SCRIPT"),
            "benchmarks",assetRepository.countByAssetType("BENCHMARK")
        )));
    }
}
