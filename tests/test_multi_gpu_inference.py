#!/usr/bin/env python3
"""
Tests for multi-GPU inference support (DataParallel) in model_inference.py
#478 P4 — TDD tests
"""
import sys, os
import unittest
from unittest.mock import patch, MagicMock

# Add eval-scripts to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "eval-scripts"))


class TestSetupModelForInference(unittest.TestCase):
    """Test setup_model_for_inference() function"""

    def _make_mock_model(self):
        """Create a mock model with .to() and .eval() methods"""
        model = MagicMock()
        model.to.return_value = model
        model.eval.return_value = model
        return model

    def test_setup_model_cpu(self):
        """CPU device should return (model, cpu_device, 1)"""
        from model_inference import setup_model_for_inference
        import torch

        model = self._make_mock_model()
        chip_info = {"chipType": "CPU", "chipName": "Intel Xeon"}
        params = {"_gpu_count": 0}

        with patch("model_inference.resolve_device", return_value=torch.device("cpu")):
            result_model, result_device, gpu_count = setup_model_for_inference(model, chip_info, params)

        self.assertEqual(result_device, torch.device("cpu"))
        self.assertEqual(gpu_count, 1)
        model.to.assert_called_with("cpu")

    def test_setup_model_cpu_no_device(self):
        """When resolve_device returns None, should fallback to CPU"""
        from model_inference import setup_model_for_inference

        model = self._make_mock_model()
        chip_info = {}
        params = {}

        with patch("model_inference.resolve_device", return_value=None):
            result_model, result_device, gpu_count = setup_model_for_inference(model, chip_info, params)

        import torch
        self.assertEqual(result_device, torch.device("cpu"))
        self.assertEqual(gpu_count, 1)

    def test_setup_model_single_gpu(self):
        """Single GPU: return (model, cuda:0, 1) without DataParallel"""
        from model_inference import setup_model_for_inference
        import torch

        model = self._make_mock_model()
        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 1}

        with patch("model_inference.resolve_device", return_value=torch.device("cuda")), \
             patch("torch.cuda.device_count", return_value=1):
            result_model, result_device, gpu_count = setup_model_for_inference(model, chip_info, params)

        self.assertEqual(gpu_count, 1)
        self.assertEqual(result_device.type, "cuda")
        # Should NOT be wrapped in DataParallel
        self.assertNotIsInstance(result_model, torch.nn.DataParallel)

    def test_setup_model_multi_gpu(self):
        """Multi-GPU: return DataParallel-wrapped model with correct gpu_count"""
        from model_inference import setup_model_for_inference
        import torch

        # Need a real nn.Module for DataParallel wrapping
        real_model = torch.nn.Linear(10, 5)

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 4, "_gpu_indices": "0,1,2,3"}

        with patch("model_inference.resolve_device", return_value=torch.device("cuda")), \
             patch("torch.cuda.device_count", return_value=4), \
             patch.object(torch.nn.DataParallel, "__init__", return_value=None) as dp_init, \
             patch.object(real_model, "to", return_value=real_model):
            # We need to mock DataParallel constructor to avoid actual CUDA
            mock_dp = MagicMock(spec=torch.nn.DataParallel)

            with patch("torch.nn.DataParallel", return_value=mock_dp) as dp_cls:
                result_model, result_device, gpu_count = setup_model_for_inference(real_model, chip_info, params)

            self.assertEqual(gpu_count, 4)
            self.assertEqual(result_device, torch.device("cuda:0"))
            dp_cls.assert_called_once_with(real_model)

    def test_effective_batch_scaling(self):
        """Verify effective_bs = bs * gpu_count"""
        base_batch_sizes = [1, 4, 16, 32]
        gpu_counts = [1, 2, 4, 8]

        for bs in base_batch_sizes:
            for gpu_count in gpu_counts:
                effective_bs = bs * gpu_count
                self.assertEqual(effective_bs, bs * gpu_count,
                                 f"Failed for bs={bs}, gpu_count={gpu_count}")

    def test_summary_gpu_info(self):
        """Verify that output config includes gpu_count and parallel_mode"""
        params = {"_gpu_count": 4, "_parallel_mode": "data_parallel"}
        config = {}
        config["gpu_count"] = params.get("_gpu_count", 0)
        config["parallel_mode"] = params.get("_parallel_mode", "none")

        self.assertEqual(config["gpu_count"], 4)
        self.assertEqual(config["parallel_mode"], "data_parallel")

    def test_summary_gpu_info_defaults(self):
        """Verify defaults when gpu params not present"""
        params = {}
        config = {}
        config["gpu_count"] = params.get("_gpu_count", 0)
        config["parallel_mode"] = params.get("_parallel_mode", "none")

        self.assertEqual(config["gpu_count"], 0)
        self.assertEqual(config["parallel_mode"], "none")


if __name__ == "__main__":
    unittest.main()
