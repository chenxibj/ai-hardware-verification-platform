#!/usr/bin/env python3
"""#482: Test pynvml-first fallback chain in collector.py"""
import sys
import os
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent'))


class TestPynvmlFallbackChain(unittest.TestCase):
    """Test that collector uses pynvml > nvidia-smi > torch.cuda fallback"""

    def test_collector_has_pynvml_function(self):
        """collector.py should have _collect_via_pynvml function"""
        import collector
        self.assertTrue(hasattr(collector, '_collect_via_pynvml'),
                        "collector.py missing _collect_via_pynvml function")

    def test_collector_has_nvidia_smi_fallback(self):
        """collector.py should have _collect_via_nvidia_smi function"""
        import collector
        self.assertTrue(hasattr(collector, '_collect_via_nvidia_smi'),
                        "collector.py missing _collect_via_nvidia_smi function")

    def test_collector_has_torch_fallback(self):
        """collector.py should have _collect_via_torch_cuda function"""
        import collector
        self.assertTrue(hasattr(collector, '_collect_via_torch_cuda'),
                        "collector.py missing _collect_via_torch_cuda function")

    @patch('collector._collect_via_pynvml')
    def test_pynvml_success_skips_nvidia_smi(self, mock_pynvml):
        """When pynvml works, nvidia-smi and torch should not be called"""
        mock_pynvml.return_value = [
            {"index": 0, "name": "NVIDIA L40S", "memory_total_mb": 46068,
             "memory_used_mb": 100, "memory_free_mb": 45968,
             "temperature_c": 40, "power_draw_w": 70.0,
             "utilization_gpu_percent": 10, "utilization_memory_percent": 2}
        ]
        import collector
        result = collector.get_gpu_info_detailed()
        self.assertEqual(result["gpu_count"], 1)
        self.assertEqual(result["gpus"][0]["name"], "NVIDIA L40S")
        mock_pynvml.assert_called_once()

    @patch('collector._collect_via_torch_cuda')
    @patch('collector._collect_via_nvidia_smi')
    @patch('collector._collect_via_pynvml')
    def test_pynvml_fails_falls_back_to_nvidia_smi(self, mock_pynvml, mock_smi, mock_torch):
        """When pynvml returns None, should try nvidia-smi"""
        mock_pynvml.return_value = None
        mock_smi.return_value = [
            {"index": 0, "name": "NVIDIA A100", "memory_total_mb": 81920}
        ]
        import collector
        result = collector.get_gpu_info_detailed()
        self.assertEqual(result["gpu_count"], 1)
        mock_pynvml.assert_called_once()
        mock_smi.assert_called_once()
        mock_torch.assert_not_called()

    @patch('collector._collect_via_torch_cuda')
    @patch('collector._collect_via_nvidia_smi')
    @patch('collector._collect_via_pynvml')
    def test_all_fail_returns_empty(self, mock_pynvml, mock_smi, mock_torch):
        """When all methods fail, should return gpu_count=0"""
        mock_pynvml.return_value = None
        mock_smi.return_value = []
        mock_torch.return_value = []
        import collector
        result = collector.get_gpu_info_detailed()
        self.assertEqual(result["gpu_count"], 0)
        self.assertEqual(result["gpus"], [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
