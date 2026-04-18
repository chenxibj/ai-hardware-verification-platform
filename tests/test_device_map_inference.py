#!/usr/bin/env python3
"""#483: Comprehensive tests for device_map="auto" preference in multi-GPU inference.

TDD tests that verify actual behavior:
- HF model name (string) + multi-GPU → device_map="auto"
- HF model name (string) + transformers fails → graceful handling
- Custom nn.Module + multi-GPU → DataParallel (unchanged)
- Single GPU → .to(device) (unchanged)
- CPU → .to("cpu") (unchanged)

Note: Dev machine has no CUDA, so we mock resolve_device() to return
the appropriate torch.device without hitting real CUDA driver.
"""
import sys
import os
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'eval-scripts'))

import torch
import torch.nn as nn


class TestHFModelDeviceMapAuto(unittest.TestCase):
    """Test HuggingFace model string name uses device_map='auto' on multi-GPU."""

    @patch('model_inference.torch.cuda.device_count', return_value=4)
    @patch('model_inference.resolve_device', return_value=torch.device("cuda:0"))
    def test_hf_model_name_uses_device_map(self, mock_resolve, mock_count):
        """String model name + multi-GPU → device_map='auto'."""
        import model_inference

        mock_model = MagicMock()
        mock_auto = MagicMock(return_value=mock_model)

        mock_transformers = MagicMock()
        mock_transformers.AutoModelForCausalLM.from_pretrained = mock_auto

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 4}

        with patch.dict('sys.modules', {'transformers': mock_transformers}):
            result_model, device, gpu_count = model_inference.setup_model_for_inference(
                "meta-llama/Llama-2-7b", chip_info, params
            )

        # Should have called from_pretrained with device_map="auto"
        mock_auto.assert_called_once()
        call_kwargs = mock_auto.call_args
        self.assertEqual(call_kwargs[1].get('device_map'), 'auto')
        self.assertEqual(gpu_count, 4)
        self.assertIs(result_model, mock_model)

    @patch('model_inference.torch.cuda.device_count', return_value=4)
    @patch('model_inference.resolve_device', return_value=torch.device("cuda:0"))
    def test_hf_model_device_map_failure_returns_none(self, mock_resolve, mock_count):
        """When device_map='auto' fails for string model, should return None (not crash)."""
        import model_inference

        mock_transformers = MagicMock()
        mock_transformers.AutoModelForCausalLM.from_pretrained.side_effect = RuntimeError("OOM")

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 4}

        with patch.dict('sys.modules', {'transformers': mock_transformers}):
            result_model, device, gpu_count = model_inference.setup_model_for_inference(
                "meta-llama/Llama-2-70b", chip_info, params
            )

        # Should return None model, not crash
        self.assertIsNone(result_model)
        self.assertEqual(gpu_count, 4)


class TestCustomModelDataParallel(unittest.TestCase):
    """Test that nn.Module objects still use DataParallel (backward compat)."""

    @patch('model_inference.torch.nn.DataParallel')
    @patch('model_inference.torch.cuda.device_count', return_value=4)
    @patch('model_inference.resolve_device', return_value=torch.device("cuda:0"))
    def test_custom_model_uses_dataparallel(self, mock_resolve, mock_count, mock_dp):
        """nn.Module instance + multi-GPU → DataParallel (not device_map)."""
        import model_inference

        model = MagicMock(spec=nn.Module)
        model.to = MagicMock(return_value=model)
        mock_dp.return_value = model

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 4}

        result_model, device, gpu_count = model_inference.setup_model_for_inference(
            model, chip_info, params
        )

        # Should call .to("cuda:0") then DataParallel, not device_map
        model.to.assert_called_with("cuda:0")
        mock_dp.assert_called_once_with(model)
        self.assertEqual(gpu_count, 4)

    def test_torch_mlp_is_module_not_string(self):
        """TorchMLP (the actual model used in main()) is nn.Module, not string.
        This confirms it would route to DataParallel, not device_map='auto'."""
        import model_inference
        model = model_inference.TorchMLP(784, 128, 10)
        self.assertFalse(isinstance(model, str))
        self.assertIsInstance(model, nn.Module)


class TestSingleGPU(unittest.TestCase):
    """Test single GPU path is unchanged."""

    @patch('model_inference.torch.cuda.device_count', return_value=1)
    @patch('model_inference.resolve_device', return_value=torch.device("cuda:0"))
    def test_single_gpu_module_to_device(self, mock_resolve, mock_count):
        """Single GPU + nn.Module → .to(device), no DataParallel."""
        import model_inference

        model = MagicMock(spec=nn.Module)
        model.to = MagicMock(return_value=model)

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 1}

        result_model, device, gpu_count = model_inference.setup_model_for_inference(
            model, chip_info, params
        )

        self.assertEqual(gpu_count, 1)
        model.to.assert_called()

    @patch('model_inference.torch.cuda.device_count', return_value=1)
    @patch('model_inference.resolve_device', return_value=torch.device("cuda:0"))
    def test_single_gpu_hf_model_loads_to_device(self, mock_resolve, mock_count):
        """Single GPU + HF model string → load with torch_dtype."""
        import model_inference

        mock_model = MagicMock()
        mock_model.to = MagicMock(return_value=mock_model)
        mock_auto = MagicMock(return_value=mock_model)

        mock_transformers = MagicMock()
        mock_transformers.AutoModelForCausalLM.from_pretrained = mock_auto

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 1}

        with patch.dict('sys.modules', {'transformers': mock_transformers}):
            result_model, device, gpu_count = model_inference.setup_model_for_inference(
                "gpt2", chip_info, params
            )

        self.assertEqual(gpu_count, 1)
        mock_auto.assert_called_once()


class TestCPUPath(unittest.TestCase):
    """Test CPU path is unchanged."""

    @patch('model_inference.resolve_device', return_value=torch.device("cpu"))
    def test_cpu_module_unchanged(self, mock_resolve):
        """CPU + nn.Module → .to('cpu')."""
        import model_inference

        model = MagicMock(spec=nn.Module)
        model.to = MagicMock(return_value=model)

        chip_info = {"chipType": "CPU", "chipName": "Intel Xeon"}
        params = {"_gpu_count": 0}

        result_model, device, gpu_count = model_inference.setup_model_for_inference(
            model, chip_info, params
        )

        self.assertEqual(gpu_count, 1)
        self.assertEqual(device.type, 'cpu')
        model.to.assert_called_with('cpu')

    @patch('model_inference.resolve_device', return_value=torch.device("cpu"))
    def test_cpu_string_model_returns_none(self, mock_resolve):
        """CPU + HF model string → returns None (caller handles)."""
        import model_inference

        chip_info = {"chipType": "CPU", "chipName": "Intel Xeon"}
        params = {"_gpu_count": 0}

        result_model, device, gpu_count = model_inference.setup_model_for_inference(
            "gpt2", chip_info, params
        )

        self.assertIsNone(result_model)
        self.assertEqual(device.type, 'cpu')
        self.assertEqual(gpu_count, 1)

    @patch('model_inference.resolve_device', return_value=None)
    def test_no_torch_returns_cpu(self, mock_resolve):
        """When resolve_device returns None → treat as CPU."""
        import model_inference

        model = MagicMock(spec=nn.Module)
        model.to = MagicMock(return_value=model)

        chip_info = {}
        params = {}

        result_model, device, gpu_count = model_inference.setup_model_for_inference(
            model, chip_info, params
        )

        self.assertEqual(gpu_count, 1)
        self.assertEqual(device.type, 'cpu')


if __name__ == '__main__':
    unittest.main(verbosity=2)
