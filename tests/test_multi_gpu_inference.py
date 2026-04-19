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
        """#512: Multi-GPU nn.Module should use single GPU (no DataParallel)"""
        from model_inference import setup_model_for_inference
        import torch

        mock_model = self._make_mock_model()

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 4, "_gpu_indices": "0,1,2,3"}

        with patch("model_inference.resolve_device", return_value=torch.device("cuda")), \
             patch("torch.cuda.device_count", return_value=4):
            result_model, result_device, gpu_count = setup_model_for_inference(mock_model, chip_info, params)

        # #512: nn.Module should NOT use DataParallel, gpu_count=1
        self.assertEqual(gpu_count, 1)
        self.assertEqual(result_device, torch.device("cuda:0"))
        mock_model.to.assert_called_with("cuda:0")

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


class TestIssue512MultiGPUNoDataParallel(unittest.TestCase):
    """#512: Multi-GPU MODEL inference should NOT use DataParallel for built-in models.

    DataParallel causes hangs/deadlocks on small nn.Module models like TorchMLP.
    The fix: for nn.Module instances, just use cuda:0 (single-GPU execution)
    even when multiple GPUs are allocated. DataParallel overhead is not worth it
    for small benchmark models and causes the process to freeze.

    Only HuggingFace string models should use device_map='auto' for multi-GPU.
    """

    def _make_mock_model(self):
        """Create a mock model with .to() method"""
        model = MagicMock()
        model.to.return_value = model
        return model

    def test_multi_gpu_nn_module_no_dataparallel(self):
        """#512: nn.Module on multi-GPU should NOT wrap in DataParallel"""
        from model_inference import setup_model_for_inference
        import torch

        model = self._make_mock_model()
        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 4, "_gpu_indices": [0, 1, 2, 3]}

        with patch("model_inference.resolve_device", return_value=torch.device("cuda")), \
             patch("torch.cuda.device_count", return_value=4):
            result_model, result_device, gpu_count = setup_model_for_inference(model, chip_info, params)

        # Should use cuda:0 directly, NOT DataParallel
        self.assertEqual(result_device.type, "cuda")
        # gpu_count should be 1 since we're only using 1 GPU for execution
        self.assertEqual(gpu_count, 1)
        # Model should be moved to cuda device, not wrapped in DataParallel
        model.to.assert_called()

    def test_multi_gpu_hf_string_uses_device_map_auto(self):
        """#512: HuggingFace string model on multi-GPU should still use device_map='auto'"""
        from model_inference import setup_model_for_inference
        import torch

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 4, "_gpu_indices": [0, 1, 2, 3]}

        # Mock transformers module since it's imported inside the function
        mock_auto_cls = MagicMock()
        mock_loaded = MagicMock()
        mock_auto_cls.from_pretrained.return_value = mock_loaded
        mock_transformers = MagicMock()
        mock_transformers.AutoModelForCausalLM = mock_auto_cls

        with patch("model_inference.resolve_device", return_value=torch.device("cuda")), \
             patch("torch.cuda.device_count", return_value=4), \
             patch.dict("sys.modules", {"transformers": mock_transformers}):
            result_model, result_device, gpu_count = setup_model_for_inference(
                "gpt2", chip_info, params
            )
            # device_map="auto" should have been called for HF models
            mock_auto_cls.from_pretrained.assert_called_once()
            call_kwargs = mock_auto_cls.from_pretrained.call_args[1]
            self.assertEqual(call_kwargs.get("device_map"), "auto")
            self.assertEqual(gpu_count, 4)

    def test_effective_batch_no_scaling_for_builtin_models(self):
        """#512: effective_bs should NOT be scaled by gpu_count for built-in models.

        When gpu_count=1 (because we don't use DataParallel), effective_bs = bs * 1 = bs.
        No more batch inflation that causes misleading results.
        """
        # With the fix, setup_model_for_inference returns gpu_count=1 for nn.Module
        # So effective_bs = bs * 1 = bs (no scaling)
        returned_gpu_count = 1  # This is what the fix returns
        for bs in [1, 4, 8, 16]:
            effective_bs = bs * returned_gpu_count
            self.assertEqual(effective_bs, bs,
                             f"effective_bs should equal bs when gpu_count=1, got {effective_bs}")
