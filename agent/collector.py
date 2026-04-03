"""系统指标采集模块"""
import platform
import time

import psutil


def get_hardware_info() -> dict:
    """采集硬件信息（注册时使用）"""
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    cpu_freq = psutil.cpu_freq()
    return {
        "hostname": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "arch": platform.machine(),
        "cpu_model": platform.processor() or platform.machine(),
        "cpu_cores_physical": psutil.cpu_count(logical=False),
        "cpu_cores_logical": psutil.cpu_count(logical=True),
        "cpu_freq_mhz": round(cpu_freq.current, 0) if cpu_freq else 0,
        "memory_total_gb": round(mem.total / (1024 ** 3), 2),
        "disk_total_gb": round(disk.total / (1024 ** 3), 2),
        "disk_free_gb": round(disk.free / (1024 ** 3), 2),
        "python_version": platform.python_version(),
    }


def get_system_metrics() -> dict:
    """采集实时系统指标（心跳时使用）"""
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    load1, load5, load15 = psutil.getloadavg()
    return {
        "cpu_percent": psutil.cpu_percent(interval=1),
        "memory_used_percent": mem.percent,
        "memory_used_gb": round(mem.used / (1024 ** 3), 2),
        "memory_available_gb": round(mem.available / (1024 ** 3), 2),
        "disk_used_percent": disk.percent,
        "load_1m": round(load1, 2),
        "load_5m": round(load5, 2),
        "load_15m": round(load15, 2),
        "timestamp": int(time.time()),
    }


def collect_during_execution(duration_sec: float = 1.0) -> dict:
    """在评测执行期间采集指标快照"""
    cpu_percents = []
    mem_percents = []
    samples = max(1, int(duration_sec / 0.5))
    for _ in range(samples):
        cpu_percents.append(psutil.cpu_percent(interval=0.5))
        mem_percents.append(psutil.virtual_memory().percent)
    return {
        "cpu_percent_avg": round(sum(cpu_percents) / len(cpu_percents), 1),
        "cpu_percent_max": round(max(cpu_percents), 1),
        "memory_percent_avg": round(sum(mem_percents) / len(mem_percents), 1),
        "memory_percent_max": round(max(mem_percents), 1),
    }
