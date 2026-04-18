#!/usr/bin/env python3
"""#482: Comprehensive tests for pynvml-first GPU collection with fallback chain.

TDD tests that verify actual behavior (not source inspection):
- pynvml success → returns correct structure, skips nvidia-smi
- pynvml ImportError → fallback to nvidia-smi
- pynvml runtime exception → fallback to nvidia-smi with warning
- All methods fail → returns empty
- pynvml GPU data structure validation
"""
import sys
import os
import unittest
from unittest.mock import patch, MagicMock, PropertyMock
import importlib

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent'))


def _reload_collector():
    """Force-reload collector to reset _nvml_initialized state."""
    import collector
    collector._nvml_initialized = False
    return collector


class TestPynvmlCollectorSuccess(unittest.TestCase):
    """Test pynvml as primary collection method."""

    def _make_mock_pynvml(self, gpu_count=1):
        """Create a fully mocked pynvml module."""
        mock_pynvml = MagicMock()
        mock_pynvml.nvmlInit = MagicMock()
        mock_pynvml.nvmlDeviceGetCount = MagicMock(return_value=gpu_count)

        handles = []
        for i in range(gpu_count):
            handle = MagicMock()
            handles.append(handle)

        mock_pynvml.nvmlDeviceGetHandleByIndex = MagicMock(side_effect=handles)
        mock_pynvml.nvmlDeviceGetName = MagicMock(return_value="NVIDIA L40S")

        mem = MagicMock()
        mem.total = 48318382080  # ~46068 MB
        mem.used = 104857600     # 100 MB
        mem.free = 48213524480   # ~45968 MB
        mock_pynvml.nvmlDeviceGetMemoryInfo = MagicMock(return_value=mem)

        mock_pynvml.NVML_TEMPERATURE_GPU = 0
        mock_pynvml.nvmlDeviceGetTemperature = MagicMock(return_value=42)
        mock_pynvml.nvmlDeviceGetPowerUsage = MagicMock(return_value=72500)  # 72.5W in mW

        util = MagicMock()
        util.gpu = 15
        util.memory = 3
        mock_pynvml.nvmlDeviceGetUtilizationRates = MagicMock(return_value=util)

        return mock_pynvml

    @patch('collector._collect_via_nvidia_smi')
    def test_pynvml_success_returns_correct_structure(self, mock_smi):
        """When pynvml works, result has gpu_count and gpus list with correct fields."""
        collector = _reload_collector()
        mock_pynvml = self._make_mock_pynvml(gpu_count=1)

        with patch.dict('sys.modules', {'pynvml': mock_pynvml}):
            result = collector.get_gpu_info_detailed()

        self.assertIn('gpu_count', result)
        self.assertEqual(result['gpu_count'], 1)
        self.assertIn('gpus', result)
        self.assertEqual(len(result['gpus']), 1)

        gpu = result['gpus'][0]
        self.assertEqual(gpu['index'], 0)
        self.assertEqual(gpu['name'], 'NVIDIA L40S')
        self.assertEqual(gpu['memory_total_mb'], 48318382080 // 1048576)
        self.assertEqual(gpu['memory_used_mb'], 104857600 // 1048576)
        self.assertIsNotNone(gpu['temperature_c'])
        self.assertIsNotNone(gpu['power_draw_w'])
        self.assertEqual(gpu['power_draw_w'], 72.5)
        self.assertEqual(gpu['utilization_gpu_percent'], 15)
        self.assertEqual(gpu['utilization_memory_percent'], 3)

        # nvidia-smi should NOT have been called
        mock_smi.assert_not_called()

    @patch('collector._collect_via_nvidia_smi')
    def test_pynvml_multi_gpu(self, mock_smi):
        """pynvml with multiple GPUs returns correct count."""
        collector = _reload_collector()
        mock_pynvml = self._make_mock_pynvml(gpu_count=4)

        with patch.dict('sys.modules', {'pynvml': mock_pynvml}):
            result = collector.get_gpu_info_detailed()

        self.assertEqual(result['gpu_count'], 4)
        self.assertEqual(len(result['gpus']), 4)
        mock_smi.assert_not_called()

    @patch('collector._collect_via_nvidia_smi')
    def test_pynvml_handles_bytes_name(self, mock_smi):
        """pynvml returning bytes GPU name should decode to str."""
        collector = _reload_collector()
        mock_pynvml = self._make_mock_pynvml(gpu_count=1)
        mock_pynvml.nvmlDeviceGetName = MagicMock(return_value=b"NVIDIA A100-SXM4-80GB")

        with patch.dict('sys.modules', {'pynvml': mock_pynvml}):
            result = collector.get_gpu_info_detailed()

        self.assertEqual(result['gpus'][0]['name'], 'NVIDIA A100-SXM4-80GB')


class TestPynvmlFallbackToNvidiaSmi(unittest.TestCase):
    """Test fallback when pynvml is unavailable or fails."""

    @patch('collector._collect_via_torch_cuda')
    @patch('collector._collect_via_nvidia_smi')
    def test_pynvml_import_error_falls_back_to_nvidia_smi(self, mock_smi, mock_torch):
        """When pynvml import fails, should fall back to nvidia-smi."""
        collector = _reload_collector()

        mock_smi.return_value = [
            {"index": 0, "name": "NVIDIA A100", "memory_total_mb": 81920,
             "memory_used_mb": 200, "memory_free_mb": 81720,
             "temperature_c": 35, "power_draw_w": 60.0,
             "utilization_gpu_percent": 5, "utilization_memory_percent": 1}
        ]

        # Make pynvml import fail
        with patch.dict('sys.modules', {'pynvml': None}):
            # _ensure_nvml will fail because import pynvml raises
            collector._nvml_initialized = False
            result = collector.get_gpu_info_detailed()

        self.assertEqual(result['gpu_count'], 1)
        self.assertEqual(result['gpus'][0]['name'], 'NVIDIA A100')
        mock_smi.assert_called_once()
        mock_torch.assert_not_called()

    @patch('collector._collect_via_torch_cuda')
    @patch('collector._collect_via_nvidia_smi')
    @patch('collector._collect_via_pynvml')
    def test_pynvml_returns_none_falls_back_to_nvidia_smi(self, mock_pynvml, mock_smi, mock_torch):
        """When _collect_via_pynvml returns None, should try nvidia-smi."""
        collector = _reload_collector()
        mock_pynvml.return_value = None
        mock_smi.return_value = [
            {"index": 0, "name": "NVIDIA V100", "memory_total_mb": 32768}
        ]

        result = collector.get_gpu_info_detailed()

        self.assertEqual(result['gpu_count'], 1)
        mock_pynvml.assert_called_once()
        mock_smi.assert_called_once()
        mock_torch.assert_not_called()

    @patch('collector._collect_via_torch_cuda')
    @patch('collector._collect_via_nvidia_smi')
    @patch('collector._collect_via_pynvml')
    def test_pynvml_and_nvidia_smi_fail_falls_back_to_torch(self, mock_pynvml, mock_smi, mock_torch):
        """When both pynvml and nvidia-smi fail, should try torch.cuda."""
        collector = _reload_collector()
        mock_pynvml.return_value = None
        mock_smi.return_value = []
        mock_torch.return_value = [
            {"index": 0, "name": "NVIDIA H100", "memory_total_mb": 81920,
             "memory_used_mb": None, "memory_free_mb": None}
        ]

        result = collector.get_gpu_info_detailed()

        self.assertEqual(result['gpu_count'], 1)
        mock_pynvml.assert_called_once()
        mock_smi.assert_called_once()
        mock_torch.assert_called_once()

    @patch('collector._collect_via_torch_cuda')
    @patch('collector._collect_via_nvidia_smi')
    @patch('collector._collect_via_pynvml')
    def test_all_methods_fail_returns_empty(self, mock_pynvml, mock_smi, mock_torch):
        """When all methods fail, should return gpu_count=0."""
        collector = _reload_collector()
        mock_pynvml.return_value = None
        mock_smi.return_value = []
        mock_torch.return_value = []

        result = collector.get_gpu_info_detailed()

        self.assertEqual(result['gpu_count'], 0)
        self.assertEqual(result['gpus'], [])


class TestNvidiaSmiCollector(unittest.TestCase):
    """Test nvidia-smi subprocess collector."""

    @patch('subprocess.run')
    def test_nvidia_smi_parses_csv_output(self, mock_run):
        """nvidia-smi collector should parse CSV output correctly."""
        collector = _reload_collector()
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="0, NVIDIA L40S, 46068, 100, 45968, 42, 72.50, 15, 3\n"
                   "1, NVIDIA L40S, 46068, 200, 45868, 44, 75.20, 20, 5\n"
        )

        result = collector._collect_via_nvidia_smi()

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['index'], 0)
        self.assertEqual(result[0]['name'], 'NVIDIA L40S')
        self.assertEqual(result[1]['index'], 1)

    @patch('subprocess.run', side_effect=FileNotFoundError)
    def test_nvidia_smi_not_found_returns_empty(self, mock_run):
        """When nvidia-smi binary not found, return empty list."""
        collector = _reload_collector()
        result = collector._collect_via_nvidia_smi()
        self.assertEqual(result, [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
