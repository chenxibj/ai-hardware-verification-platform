"""系统指标采集模块 (#482: pynvml-first GPU collection)"""
import logging
import platform
import time

import psutil

logger = logging.getLogger(__name__)


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
    metrics = {
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

    # #478: GPU real-time metrics (every heartbeat)
    gpu_info = get_gpu_info_detailed()
    metrics["gpu_count"] = gpu_info["gpu_count"]
    metrics["gpus"] = gpu_info["gpus"]

    return metrics


def _safe_int(s):
    """Safely convert string to int"""
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def _safe_float(s):
    """Safely convert string to float"""
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


# ── pynvml lazy init (once per process lifetime) ──
_nvml_initialized = False


def _ensure_nvml():
    """Lazy-init pynvml; only call nvmlInit once per process."""
    global _nvml_initialized
    if _nvml_initialized:
        return True
    try:
        import pynvml
        pynvml.nvmlInit()
        _nvml_initialized = True
        return True
    except Exception as e:
        logger.debug("pynvml init failed: %s", e)
        return False


def _collect_via_pynvml():
    """#482: Collect GPU info via pynvml C bindings (zero fork overhead).
    Returns list of gpu dicts, or None if pynvml unavailable."""
    if not _ensure_nvml():
        return None
    try:
        import pynvml
        count = pynvml.nvmlDeviceGetCount()
        gpus = []
        for i in range(count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)
            name = pynvml.nvmlDeviceGetName(handle)
            if isinstance(name, bytes):
                name = name.decode("utf-8")
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)

            try:
                temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            except Exception:
                temp = None

            try:
                power = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0  # mW -> W
            except Exception:
                power = None

            try:
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                gpu_util = util.gpu
                mem_util = util.memory
            except Exception:
                gpu_util = None
                mem_util = None

            gpus.append({
                "index": i,
                "name": name,
                "memory_total_mb": mem_info.total // 1048576,
                "memory_used_mb": mem_info.used // 1048576,
                "memory_free_mb": mem_info.free // 1048576,
                "temperature_c": temp,
                "power_draw_w": round(power, 1) if power else None,
                "utilization_gpu_percent": gpu_util,
                "utilization_memory_percent": mem_util,
            })
        return gpus
    except Exception as e:
        logger.warning("pynvml collect failed: %s", e)
        return None


def _collect_via_nvidia_smi():
    """Collect GPU info via nvidia-smi CLI (fork process, fallback)."""
    try:
        import subprocess as _sp
        result = _sp.run(
            ['nvidia-smi',
             '--query-gpu=index,name,memory.total,memory.used,memory.free,'
             'temperature.gpu,power.draw,utilization.gpu,utilization.memory',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return []
        gpus = []
        for line in result.stdout.strip().split('\n'):
            parts = [p.strip() for p in line.split(',')]
            if len(parts) >= 9:
                gpus.append({
                    "index": int(parts[0]),
                    "name": parts[1],
                    "memory_total_mb": _safe_int(parts[2]),
                    "memory_used_mb": _safe_int(parts[3]),
                    "memory_free_mb": _safe_int(parts[4]),
                    "temperature_c": _safe_int(parts[5]),
                    "power_draw_w": _safe_float(parts[6]),
                    "utilization_gpu_percent": _safe_int(parts[7]),
                    "utilization_memory_percent": _safe_int(parts[8]),
                })
        return gpus
    except FileNotFoundError:
        return []
    except Exception:
        return []


def _collect_via_torch_cuda():
    """Collect basic GPU info via torch.cuda (last resort fallback)."""
    try:
        import torch
        gpus = []
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            gpus.append({
                "index": i,
                "name": props.name,
                "memory_total_mb": props.total_mem // 1048576,
                "memory_used_mb": None,
                "memory_free_mb": None,
                "temperature_c": None,
                "power_draw_w": None,
                "utilization_gpu_percent": None,
                "utilization_memory_percent": None,
            })
        return gpus
    except Exception:
        return []


def get_gpu_info_detailed() -> dict:
    """#482: GPU info with pynvml > nvidia-smi > torch.cuda fallback chain.

    Returns:
    {
        "gpu_count": N,
        "gpus": [ { "index": 0, "name": "...", ... }, ... ]
    }
    """
    # Priority 1: pynvml (C bindings, zero fork overhead)
    gpus = _collect_via_pynvml()
    if gpus is not None:
        return {"gpu_count": len(gpus), "gpus": gpus}

    # Priority 2: nvidia-smi (fork process)
    gpus = _collect_via_nvidia_smi()
    if gpus:
        return {"gpu_count": len(gpus), "gpus": gpus}

    # Priority 3: torch.cuda (basic info only)
    gpus = _collect_via_torch_cuda()
    return {"gpu_count": len(gpus), "gpus": gpus}


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
