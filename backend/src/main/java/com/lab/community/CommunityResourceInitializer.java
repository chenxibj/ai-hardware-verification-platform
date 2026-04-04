package com.lab.community;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 社区资源预置数据初始化 (#178)
 */
@Slf4j
@Component
@Order(20)
@RequiredArgsConstructor
public class CommunityResourceInitializer implements CommandLineRunner {

    private final CommunityResourceRepository resourceRepository;

    @Override
    public void run(String... args) {
        if (resourceRepository.count() > 0) {
            log.info("Community resources already initialized, skipping.");
            return;
        }
        log.info("Initializing community resources...");

        create("GPU评测脚本模板", "通用GPU性能评测Shell脚本，支持NVIDIA/AMD/国产GPU",
                CommunityResource.ResourceCategory.EVAL_SCRIPT, "gpu_benchmark.sh", 4096L);
        create("NPU推理评测脚本", "Python推理性能评测脚本，支持ONNX/TensorRT模型",
                CommunityResource.ResourceCategory.EVAL_SCRIPT, "npu_inference_bench.py", 8192L);
        create("算子Benchmark配置", "常用深度学习算子的Benchmark配置文件（YAML格式）",
                CommunityResource.ResourceCategory.BASELINE_DATA, "operator_benchmark.yaml", 12288L);
        create("ResNet50基准数据集", "ResNet50推理精度验证基准数据（1000张ImageNet样本）",
                CommunityResource.ResourceCategory.BASELINE_DATA, "resnet50_baseline.tar.gz", 52428800L);
        create("评测报告模板", "标准芯片评测报告Markdown模板，含评分维度和分析框架",
                CommunityResource.ResourceCategory.REPORT_TEMPLATE, "report_template.md", 6144L);
        create("评测环境配置指南", "完整的评测环境搭建指南，含Docker/驱动/依赖安装",
                CommunityResource.ResourceCategory.BEST_PRACTICE, "env_setup_guide.pdf", 2097152L);
        create("BERT推理性能脚本", "BERT模型推理性能评测脚本（PyTorch/ONNX）",
                CommunityResource.ResourceCategory.EVAL_SCRIPT, "bert_inference_bench.py", 5120L);
        create("MLPerf配置模板", "MLPerf Inference基准测试配置模板",
                CommunityResource.ResourceCategory.BENCHMARK_IMAGE, "mlperf_config.json", 3072L);

        log.info("Community resources initialized: {} entries", resourceRepository.count());
    }

    private void create(String name, String desc, CommunityResource.ResourceCategory cat,
                        String fileName, Long fileSize) {
        CommunityResource r = new CommunityResource();
        r.setName(name);
        r.setDescription(desc);
        r.setCategory(cat);
        r.setFileName(fileName);
        r.setFileSize(fileSize);
        r.setDownloadCount(0);
        resourceRepository.save(r);
    }
}
