package com.lab.config;

import com.lab.template.TaskTemplate;
import com.lab.template.TaskTemplateRepository;
import com.lab.user.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.List;

@Component
public class DataInitializer implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);
    
    private final UserService userService;
    private final TaskTemplateRepository templateRepo;
    
    public DataInitializer(UserService userService, TaskTemplateRepository templateRepo) {
        this.userService = userService;
        this.templateRepo = templateRepo;
    }
    
    @Override
    public void run(String... args) {
        userService.initAdminUser();
        initSystemTemplates();
        log.info("Data initialization completed");
    }
    
    private void initSystemTemplates() {
        List<TaskTemplate> existing = templateRepo.findByIsSystemTrue();
        if (!existing.isEmpty()) {
            log.info("System templates already exist, skipping");
            return;
        }
        
        // Template 1: CPU Operator Benchmark
        TaskTemplate t1 = new TaskTemplate();
        t1.setName("CPU 算子基准评测");
        t1.setDescription("10个核心CPU算子的性能基准测试，包含MatMul、Conv2D、ReLU等");
        t1.setEvalType("PERFORMANCE");
        t1.setIsSystem(Boolean.TRUE);
        t1.setConfigJson("{\"evalDimension\":\"OPERATOR\",\"evalObject\":\"OPERATOR\",\"operators\":[\"MatMul\",\"Conv2D\",\"ReLU\",\"Softmax\",\"BatchNorm\",\"LayerNorm\",\"GELU\",\"Transpose\",\"MatInverse\",\"SVD\"],\"matrix_size\":512,\"iterations\":50,\"data_type\":\"float32\",\"priority\":\"MEDIUM\",\"tags\":\"CPU,算子,基准\"}");
        t1.setCreatedBy(1L);
        t1.setCreatedAt(Instant.now());
        t1.setUpdatedAt(Instant.now());
        templateRepo.save(t1);
        
        // Template 2: CPU Model Inference
        TaskTemplate t2 = new TaskTemplate();
        t2.setName("CPU 模型推理评测");
        t2.setDescription("CPU环境下的模型推理性能测试");
        t2.setEvalType("PERFORMANCE");
        t2.setIsSystem(Boolean.TRUE);
        t2.setConfigJson("{\"evalDimension\":\"MODEL\",\"evalObject\":\"MODEL\",\"models\":[\"ResNet50\",\"MobileNetV2\"],\"batch_sizes\":[1,4,8],\"warmup\":5,\"iterations\":20,\"priority\":\"MEDIUM\",\"tags\":\"CPU,模型,推理\"}");
        t2.setCreatedBy(1L);
        t2.setCreatedAt(Instant.now());
        t2.setUpdatedAt(Instant.now());
        templateRepo.save(t2);
        
        // Template 3: Quick Operator Test
        TaskTemplate t3 = new TaskTemplate();
        t3.setName("算子精简快测");
        t3.setDescription("3个关键算子的快速性能验证，适合日常回归测试");
        t3.setEvalType("PERFORMANCE");
        t3.setIsSystem(Boolean.TRUE);
        t3.setConfigJson("{\"evalDimension\":\"OPERATOR\",\"evalObject\":\"OPERATOR\",\"operators\":[\"MatMul\",\"Conv2D\",\"GELU\"],\"matrix_size\":256,\"iterations\":10,\"data_type\":\"float32\",\"priority\":\"LOW\",\"tags\":\"CPU,算子,快测\"}");
        t3.setCreatedBy(1L);
        t3.setCreatedAt(Instant.now());
        t3.setUpdatedAt(Instant.now());
        templateRepo.save(t3);
        
        log.info("Created 3 system preset templates");
    }
}
