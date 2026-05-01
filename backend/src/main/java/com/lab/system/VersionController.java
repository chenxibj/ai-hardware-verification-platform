package com.lab.system;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringBootVersion;
import org.springframework.web.bind.annotation.*;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/version")
public class VersionController {

    @Value("${app.version:unknown}")
    private String version;

    @Value("${app.git-commit:unknown}")
    private String gitCommit;

    @Value("${app.build-time:unknown}")
    private String buildTime;

    @GetMapping
    public Map<String, String> version() {
        Map<String, String> info = new LinkedHashMap<>();
        info.put("version", version);
        info.put("gitCommit", gitCommit);
        info.put("buildTime", buildTime);
        info.put("javaVersion", System.getProperty("java.version"));
        info.put("springBootVersion", SpringBootVersion.getVersion());
        return info;
    }
}
