"""
Pytest configuration for AHVP tests.

#550: Automatically skip GPU-dependent tests when GPU_NODE env is not set
or when running in a CI environment without GPU hardware.
"""
import os
import pytest


def pytest_collection_modifyitems(config, items):
    """Skip GPU tests when GPU_NODE is not configured."""
    gpu_tests = [
        "test_gpu_isolation",
        "test_gpu_p1p2",
        "test_multi_gpu_inference",
        "test_multi_gpu_inference_485",
        "test_multi_gpu_training",
        "test_pynvml_collector",
        "test_pynvml_fallback",
        "test_torchrun_scope",
        "test_device_map_auto",
        "test_device_map_inference",
        "test_bind_release_port",
    ]

    skip_gpu = pytest.mark.skip(
        reason="GPU_NODE not set — skip GPU-dependent tests (see #550)"
    )

    if not os.environ.get("GPU_NODE"):
        for item in items:
            module_name = item.module.__name__ if item.module else ""
            for gpu_test in gpu_tests:
                if gpu_test in module_name:
                    item.add_marker(skip_gpu)
                    break
