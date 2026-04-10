package com.lab;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 人工智能软硬件验证平台 - 后端服务
 */
@SpringBootApplication
@EnableScheduling
@EnableAsync
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
        System.out.println("===========================================");
        System.out.println("  AI Hardware Verification Platform Started");
        System.out.println("  Version: 1.0.0-SNAPSHOT");
        System.out.println("===========================================");
    }
}
