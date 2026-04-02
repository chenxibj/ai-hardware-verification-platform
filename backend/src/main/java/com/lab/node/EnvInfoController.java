package com.lab.node;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.io.*;
import java.util.*;
import java.util.concurrent.*;

@RestController
@RequestMapping("/nodes")
public class EnvInfoController {

    private static final Logger log = LoggerFactory.getLogger(EnvInfoController.class);
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    public EnvInfoController(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/{id}/env-info")
    public ResponseEntity<Map<String, Object>> getEnvInfo(@PathVariable("id") Long id) {
        try {
            String json = jdbcTemplate.queryForObject(
                "SELECT env_info::text FROM compute_nodes WHERE id = ?",
                String.class, id);
            if (json != null && !json.isEmpty()) {
                Map<String, Object> envInfo = objectMapper.readValue(json, Map.class);
                return ResponseEntity.ok(Map.of("code", 0, "data", envInfo));
            }
            return ResponseEntity.ok(Map.of("code", 0, "data", Map.of(), "message", "暂无环境信息"));
        } catch (Exception e) {
            log.error("获取环境信息失败: nodeId={}", id, e);
            return ResponseEntity.ok(Map.of("code", -1, "message", "获取环境信息失败: " + e.getMessage()));
        }
    }

    @PostMapping("/{id}/env-info/collect")
    public ResponseEntity<Map<String, Object>> collectEnvInfo(@PathVariable("id") Long id) {
        try {
            Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT ip_address, ssh_port, ssh_user, ssh_auth_type, ssh_key FROM compute_nodes WHERE id = ?", id);
            String ip = (String) row.get("ip_address");
            Integer port = (Integer) row.get("ssh_port");
            String user = (String) row.get("ssh_user");
            String authType = (String) row.get("ssh_auth_type");
            String sshKey = (String) row.get("ssh_key");

            if (ip == null || ip.isEmpty()) {
                return ResponseEntity.ok(Map.of("code", -1, "message", "节点无IP地址"));
            }

            // Async collect
            final String fIp = ip;
            final int fPort = port != null ? port : 22;
            final String fUser = user != null ? user : "root";
            final String fAuthType = authType;
            final String fSshKey = sshKey;
            executor.submit(() -> {
                try {
                    doCollect(id, fIp, fPort, fUser, fAuthType, fSshKey);
                } catch (Exception e) {
                    log.error("采集环境信息失败: nodeId={}", id, e);
                }
            });

            return ResponseEntity.ok(Map.of("code", 0, "message", "采集任务已提交"));
        } catch (Exception e) {
            return ResponseEntity.status(404).body(Map.of("code", -1, "message", "节点不存在"));
        }
    }

    @PostMapping("/{id}/env-info/local-collect")
    public ResponseEntity<Map<String, Object>> localCollect(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        // For node agent to report env info directly
        try {
            String json = objectMapper.writeValueAsString(body);
            jdbcTemplate.update("UPDATE compute_nodes SET env_info = ?::jsonb WHERE id = ?", json, id);
            return ResponseEntity.ok(Map.of("code", 0, "message", "环境信息已更新"));
        } catch (Exception e) {
            log.error("更新环境信息失败: nodeId={}", id, e);
            return ResponseEntity.ok(Map.of("code", -1, "message", "更新失败: " + e.getMessage()));
        }
    }

    @GetMapping("/env-info/batch")
    public ResponseEntity<Map<String, Object>> batchGetEnvInfo() {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, env_info::text as env_info FROM compute_nodes WHERE env_info IS NOT NULL");
            Map<String, Object> result = new HashMap<>();
            for (Map<String, Object> row : rows) {
                Long nodeId = ((Number) row.get("id")).longValue();
                String json = (String) row.get("env_info");
                if (json != null && !json.isEmpty()) {
                    try {
                        result.put(String.valueOf(nodeId), objectMapper.readValue(json, Map.class));
                    } catch (Exception ignored) {}
                }
            }
            return ResponseEntity.ok(Map.of("code", 0, "data", result));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("code", -1, "message", "批量获取失败: " + e.getMessage()));
        }
    }

    private void doCollect(Long nodeId, String ip, int port, String user, String authType, String sshKey) {
        try {
            String collectScript = buildCollectScript();

            // Build SSH command
            List<String> cmd = new ArrayList<>();
            cmd.add("ssh");
            cmd.add("-o"); cmd.add("StrictHostKeyChecking=no");
            cmd.add("-o"); cmd.add("ConnectTimeout=10");
            cmd.add("-o"); cmd.add("BatchMode=yes");
            cmd.add("-p"); cmd.add(String.valueOf(port));

            // If key auth, write temp key file
            File tempKey = null;
            if ("key".equals(authType) && sshKey != null) {
                tempKey = File.createTempFile("ssh_key_", ".pem");
                tempKey.deleteOnExit();
                try (FileWriter fw = new FileWriter(tempKey)) {
                    fw.write(sshKey);
                }
                Runtime.getRuntime().exec(new String[]{"chmod", "600", tempKey.getAbsolutePath()}).waitFor();
                cmd.add("-i"); cmd.add(tempKey.getAbsolutePath());
            }

            cmd.add(user + "@" + ip);
            cmd.add("bash -s");

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            // Send script to stdin
            try (OutputStream os = process.getOutputStream()) {
                os.write(collectScript.getBytes());
                os.flush();
            }

            // Read output
            StringBuilder output = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = br.readLine()) != null) {
                    output.append(line).append("\n");
                }
            }

            boolean ok = process.waitFor(30, TimeUnit.SECONDS);
            if (tempKey != null) tempKey.delete();

            if (!ok) {
                log.warn("SSH采集超时: nodeId={}", nodeId);
                return;
            }

            String rawOutput = output.toString().trim();
            // Find JSON block between markers
            int start = rawOutput.indexOf("===ENV_INFO_BEGIN===");
            int end = rawOutput.indexOf("===ENV_INFO_END===");
            if (start >= 0 && end > start) {
                String jsonStr = rawOutput.substring(start + "===ENV_INFO_BEGIN===".length(), end).trim();
                // Validate JSON
                Map<String, Object> envInfo = objectMapper.readValue(jsonStr, Map.class);
                String envJson = objectMapper.writeValueAsString(envInfo);
                jdbcTemplate.update("UPDATE compute_nodes SET env_info = ?::jsonb WHERE id = ?", envJson, nodeId);
                log.info("环境信息采集成功: nodeId={}", nodeId);
            } else {
                log.warn("采集输出未包含有效JSON: nodeId={}, output={}", nodeId,
                    rawOutput.length() > 500 ? rawOutput.substring(0, 500) : rawOutput);
            }
        } catch (Exception e) {
            log.error("SSH采集环境信息异常: nodeId={}", nodeId, e);
        }
    }

    private String buildCollectScript() {
        return "#!/bin/bash\n" +
            "set -e\n" +
            "echo '===ENV_INFO_BEGIN==='\n" +
            "python3 -c '\n" +
            "import json, subprocess, os, platform, re\n" +
            "\n" +
            "def run(cmd):\n" +
            "    try:\n" +
            "        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)\n" +
            "        return r.stdout.strip()\n" +
            "    except: return \"\"\n" +
            "\n" +
            "info = {}\n" +
            "\n" +
            "# OS info\n" +
            "os_release = {}\n" +
            "if os.path.exists(\"/etc/os-release\"):\n" +
            "    with open(\"/etc/os-release\") as f:\n" +
            "        for line in f:\n" +
            "            if \"=\" in line:\n" +
            "                k,v = line.strip().split(\"=\", 1)\n" +
            "                os_release[k] = v.strip('\"')\n" +
            "info[\"os_name\"] = os_release.get(\"NAME\", platform.system())\n" +
            "info[\"os_version\"] = os_release.get(\"VERSION\", platform.release())\n" +
            "info[\"os_pretty\"] = os_release.get(\"PRETTY_NAME\", platform.platform())\n" +
            "info[\"os_id\"] = os_release.get(\"ID\", \"\")\n" +
            "\n" +
            "# Kernel\n" +
            "info[\"kernel_version\"] = platform.release()\n" +
            "info[\"kernel_full\"] = run(\"uname -a\")\n" +
            "\n" +
            "# CPU detailed\n" +
            "info[\"cpu_arch\"] = platform.machine()\n" +
            "cpu_info = run(\"lscpu\")\n" +
            "info[\"cpu_model\"] = \"\"\n" +
            "info[\"cpu_cores\"] = 0\n" +
            "info[\"cpu_threads\"] = 0\n" +
            "info[\"cpu_sockets\"] = 0\n" +
            "for line in cpu_info.split(\"\\n\"):\n" +
            "    if \"Model name\" in line: info[\"cpu_model\"] = line.split(\":\",1)[1].strip()\n" +
            "    if \"CPU(s):\" in line and \"NUMA\" not in line and \"On-line\" not in line: info[\"cpu_threads\"] = int(line.split(\":\",1)[1].strip())\n" +
            "    if \"Core(s) per socket\" in line: info[\"cpu_cores\"] = int(line.split(\":\",1)[1].strip())\n" +
            "    if \"Socket(s)\" in line: info[\"cpu_sockets\"] = int(line.split(\":\",1)[1].strip())\n" +
            "\n" +
            "# CPU instruction sets\n" +
            "flags = \"\"\n" +
            "try:\n" +
            "    with open(\"/proc/cpuinfo\") as f:\n" +
            "        for line in f:\n" +
            "            if line.startswith(\"flags\"):\n" +
            "                flags = line.split(\":\",1)[1].strip()\n" +
            "                break\n" +
            "except: pass\n" +
            "isa_checks = [\"avx\", \"avx2\", \"avx512f\", \"sse4_1\", \"sse4_2\", \"fma\", \"vnni\", \"amx_tile\", \"amx_bf16\", \"amx_int8\", \"f16c\", \"bmi2\"]\n" +
            "info[\"cpu_flags\"] = [f for f in isa_checks if f in flags.split()]\n" +
            "info[\"avx2_support\"] = \"avx2\" in flags\n" +
            "info[\"avx512_support\"] = \"avx512f\" in flags\n" +
            "\n" +
            "# GPU info\n" +
            "gpu_info = run(\"nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>/dev/null\")\n" +
            "gpus = []\n" +
            "if gpu_info:\n" +
            "    for line in gpu_info.strip().split(\"\\n\"):\n" +
            "        parts = [p.strip() for p in line.split(\",\")]\n" +
            "        if len(parts) >= 3:\n" +
            "            gpus.append({\"name\": parts[0], \"memory_mb\": int(float(parts[1])), \"driver\": parts[2]})\n" +
            "info[\"gpus\"] = gpus\n" +
            "info[\"gpu_count\"] = len(gpus)\n" +
            "if gpus:\n" +
            "    info[\"gpu_driver\"] = gpus[0][\"driver\"]\n" +
            "\n" +
            "# CUDA version\n" +
            "cuda_ver = run(\"nvcc --version 2>/dev/null | grep release | sed 's/.*release //' | sed 's/,.*//'\") or run(\"cat /usr/local/cuda/version.txt 2>/dev/null\") or \"\"\n" +
            "info[\"cuda_version\"] = cuda_ver\n" +
            "\n" +
            "# cuDNN\n" +
            "cudnn_ver = run(\"cat /usr/include/cudnn_version.h 2>/dev/null | grep CUDNN_MAJOR -A2 | head -3\") or run(\"python3 -c 'import torch; print(torch.backends.cudnn.version())' 2>/dev/null\") or \"\"\n" +
            "info[\"cudnn_version\"] = cudnn_ver\n" +
            "\n" +
            "# Python\n" +
            "info[\"python_version\"] = run(\"python3 --version 2>/dev/null\").replace(\"Python \", \"\")\n" +
            "info[\"python_path\"] = run(\"which python3 2>/dev/null\")\n" +
            "\n" +
            "# pip packages (DL frameworks)\n" +
            "pip_list = run(\"pip3 list --format=json 2>/dev/null\")\n" +
            "pkg_versions = {}\n" +
            "try:\n" +
            "    pkgs = json.loads(pip_list) if pip_list else []\n" +
            "    target_pkgs = [\"torch\", \"torchvision\", \"torchaudio\", \"tensorflow\", \"tensorflow-gpu\", \"onnxruntime\", \"onnxruntime-gpu\", \"numpy\", \"transformers\", \"paddlepaddle\", \"paddlepaddle-gpu\", \"mindspore\"]\n" +
            "    for p in pkgs:\n" +
            "        if p[\"name\"].lower() in target_pkgs:\n" +
            "            pkg_versions[p[\"name\"]] = p[\"version\"]\n" +
            "except: pass\n" +
            "info[\"dl_frameworks\"] = pkg_versions\n" +
            "\n" +
            "# PyTorch CUDA check\n" +
            "torch_cuda = run(\"python3 -c 'import torch; print(torch.cuda.is_available())' 2>/dev/null\")\n" +
            "info[\"pytorch_cuda_available\"] = torch_cuda == \"True\"\n" +
            "\n" +
            "# Collected timestamp\n" +
            "import datetime\n" +
            "info[\"collected_at\"] = datetime.datetime.utcnow().isoformat() + \"Z\"\n" +
            "\n" +
            "print(json.dumps(info))\n" +
            "' 2>/dev/null || echo '{}'\n" +
            "echo '===ENV_INFO_END==='\n";
    }
}
