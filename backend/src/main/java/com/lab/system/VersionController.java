package com.lab.system;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/version")
public class VersionController {
    @Value("${app.version:unknown}") private String version;
    @Value("${app.git-commit:unknown}") private String gitCommit;
    @Value("${app.build-time:unknown}") private String buildTime;

    @GetMapping
    public Map<String, String> version() {
        return Map.of(
            "version", version,
            "gitCommit", gitCommit,
            "buildTime", buildTime
        );
    }
}
