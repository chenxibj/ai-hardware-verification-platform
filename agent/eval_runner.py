"""
评测运行器 (#243) — 使用 LogReporter 进行增强日志上报
包装 executor.py 的 _run_task，在关键位置插入结构化日志
"""
import json
import logging
import os
import platform
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

from log_reporter import LogReporter

logger = logging.getLogger(__name__)

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False


def get_system_info():
    """收集系统信息"""
    info = {
        "hostname": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "arch": platform.machine(),
        "python": platform.python_version(),
        "cpu_count": os.cpu_count(),
    }
    if HAS_PSUTIL:
        mem = psutil.virtual_memory()
        info["memory_total_gb"] = round(mem.total / (1024**3), 1)
        info["memory_available_gb"] = round(mem.available / (1024**3), 1)
        info["cpu_percent"] = psutil.cpu_percent(interval=0)
    return info


def get_memory_stats():
    """获取当前内存统计"""
    if not HAS_PSUTIL:
        return {}
    mem = psutil.virtual_memory()
    proc = psutil.Process()
    return {
        "system_memory_percent": mem.percent,
        "system_memory_available_gb": round(mem.available / (1024**3), 2),
        "process_rss_mb": round(proc.memory_info().rss / (1024**2), 2),
    }


def run_eval_with_logging(
    platform_url: str,
    token: str,
    task_id: int,
    script_path: str,
    params: dict,
    project_root: str,
    plan_id: int = None,
    node_id: str = None,
    timeout: int = 600,
):
    """
    执行评测脚本，使用 LogReporter 记录详细日志。
    
    Returns:
        tuple: (returncode, stdout_text, stderr_text)
    """
    with LogReporter(
        platform_url=platform_url,
        token=token,
        task_id=task_id,
        plan_id=plan_id,
        node_id=node_id,
        source="AGENT",
    ) as reporter:
        start_time = time.time()

        # ── 日志: 开始 ──
        sys_info = get_system_info()
        reporter.system(
            f"评测任务 {task_id} 开始 | {sys_info.get('hostname', 'unknown')} | "
            f"{sys_info.get('cpu_count', '?')} cores | "
            f"{sys_info.get('memory_total_gb', 0):.1f}GB RAM",
            context=sys_info,
        )
        reporter.info(f"脚本: {os.path.basename(script_path)}")
        reporter.info(f"参数: {json.dumps(params, ensure_ascii=False)[:500]}")

        # ── 日志: 数据加载 ──
        reporter.info("正在加载评测数据和准备环境...")

        cmd = ["python3", script_path]
        if params:
            cmd.append(json.dumps(params))

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=project_root,
        )

        stdout_lines = []
        stderr_lines = []
        line_count = 0
        metric_count = 0

        def read_stdout(stream):
            nonlocal line_count, metric_count
            for line in iter(stream.readline, ''):
                stdout_lines.append(line)
                stripped = line.rstrip('\n\r')
                if not stripped:
                    continue
                line_count += 1

                # 检测进度行
                if any(p in stripped.lower() for p in ['progress', 'step', '%', '/']):
                    reporter.progress(stripped)
                # 检测 JSON metric 行
                elif stripped.startswith('{'):
                    try:
                        obj = json.loads(stripped)
                        if isinstance(obj, dict):
                            # 提取 numeric 字段作为 metrics
                            numeric = {k: v for k, v in obj.items() if isinstance(v, (int, float))}
                            if numeric:
                                metric_count += 1
                                reporter.metric(stripped[:200], metrics=numeric)
                            else:
                                reporter.info(stripped[:500])
                        else:
                            reporter.info(stripped[:500])
                    except json.JSONDecodeError:
                        reporter.info(stripped[:500])
                else:
                    reporter.info(stripped[:500])

                # 每 10 行报告一次进度
                if line_count % 10 == 0:
                    elapsed = time.time() - start_time
                    reporter.progress(
                        f"已处理 {line_count} 行输出, 耗时 {elapsed:.1f}s",
                        metrics={"lines_processed": line_count, "elapsed_sec": round(elapsed, 1)},
                    )

            stream.close()

        def read_stderr(stream):
            for line in iter(stream.readline, ''):
                stderr_lines.append(line)
                stripped = line.rstrip('\n\r')
                if stripped:
                    reporter.error(stripped[:500])
            stream.close()

        t_out = threading.Thread(target=read_stdout, args=(process.stdout,), daemon=True)
        t_err = threading.Thread(target=read_stderr, args=(process.stderr,), daemon=True)
        t_out.start()
        t_err.start()

        # ── 日志: warmup 开始（评测脚本内部会 warmup，这里标记外部等待） ──
        reporter.info("评测脚本已启动, 等待执行完成...")

        try:
            returncode = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            returncode = -1
            reporter.error(f"评测超时 ({timeout}s), 进程已终止")

        t_out.join(timeout=5)
        t_err.join(timeout=5)

        elapsed = time.time() - start_time

        # ── 日志: 内存统计 ──
        mem_stats = get_memory_stats()
        if mem_stats:
            reporter.metric("内存统计", metrics=mem_stats)

        # ── 日志: 结束 ──
        if returncode == 0:
            reporter.system(
                f"评测任务 {task_id} 完成 | 耗时 {elapsed:.1f}s | "
                f"输出 {line_count} 行 | {metric_count} 个 metric",
                context={
                    "duration_sec": round(elapsed, 2),
                    "lines": line_count,
                    "metrics_count": metric_count,
                    "node_id": node_id,
                },
            )
        else:
            reporter.error(
                f"评测任务 {task_id} 失败 | 返回码 {returncode} | 耗时 {elapsed:.1f}s",
                context={
                    "returncode": returncode,
                    "duration_sec": round(elapsed, 2),
                    "node_id": node_id,
                },
            )

        stdout_text = "".join(stdout_lines)
        stderr_text = "".join(stderr_lines)
        return returncode, stdout_text, stderr_text


if __name__ == "__main__":
    # 独立测试用
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--task-id", type=int, required=True)
    parser.add_argument("--script", required=True)
    parser.add_argument("--params", default="{}")
    parser.add_argument("--project-root", default=".")
    args = parser.parse_args()

    rc, out, err = run_eval_with_logging(
        platform_url=args.url,
        token=args.token,
        task_id=args.task_id,
        script_path=args.script,
        params=json.loads(args.params),
        project_root=args.project_root,
    )
    print(f"Return code: {rc}")
    sys.exit(rc)
