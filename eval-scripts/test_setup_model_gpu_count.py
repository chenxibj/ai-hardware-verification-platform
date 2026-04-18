#!/usr/bin/env python3
"""
#485: Test that setup_model_for_inference uses _gpu_count from scheduler
instead of torch.cuda.device_count() to determine multi-GPU path.
"""
import sys
import os
import unittest
from unittest.mock import patch, MagicMock

# Add eval-scripts to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "eval-scripts"))


class TestSetupModelGpuCount(unittest.TestCase):
    """Test that setup_model_for_inference respects _gpu_count from scheduler."""

    @patch("model_inference.torch")
    @patch("model_inference.HAS_TORCH", True)
    @patch("model_inference.resolve_device")
    def test_multi_gpu_when_gpu_count_4(self, mock_resolve, mock_torch):
        """When _gpu_count=4, should take multi-GPU path even if device_count=1."""
        from model_inference import setup_model_for_inference

        mock_device = MagicMock()
        mock_device.type = "cuda"
        mock_resolve.return_value = mock_device
        mock_torch.cuda.is_available.return_value = True
        mock_torch.cuda.device_count.return_value = 1  # Only 1 visible GPU

        # Mock nn.Module model
        mock_model = MagicMock()
        mock_model.to.return_value = mock_model

        # Mock DataParallel
        mock_dp = MagicMock()
        mock_torch.nn.DataParallel.return_value = mock_dp

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 4}  # Scheduler says 4 GPUs allocated

        result_model, result_device, effective_gpus = setup_model_for_inference(
            mock_model, chip_info, params
        )

        # Should use 4 GPUs (from _gpu_count), NOT 1 (from device_count)
        self.assertEqual(effective_gpus, 4)
        # Should call DataParallel
        mock_torch.nn.DataParallel.assert_called_once()

    @patch("model_inference.torch")
    @patch("model_inference.HAS_TORCH", True)
    @patch("model_inference.resolve_device")
    def test_single_gpu_when_gpu_count_1(self, mock_resolve, mock_torch):
        """When _gpu_count=1, should take single-GPU path even if device_count=8."""
        from model_inference import setup_model_for_inference

        mock_device = MagicMock()
        mock_device.type = "cuda"
        mock_resolve.return_value = mock_device
        mock_torch.cuda.is_available.return_value = True
        mock_torch.cuda.device_count.return_value = 8  # 8 visible GPUs

        mock_model = MagicMock()
        mock_model.to.return_value = mock_model

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 1}  # Scheduler says 1 GPU allocated

        result_model, result_device, effective_gpus = setup_model_for_inference(
            mock_model, chip_info, params
        )

        # Should use 1 GPU (from _gpu_count), NOT 8 (from device_count)
        self.assertEqual(effective_gpus, 1)
        # Should NOT call DataParallel
        mock_torch.nn.DataParallel.assert_not_called()

    @patch("model_inference.torch")
    @patch("model_inference.HAS_TORCH", True)
    @patch("model_inference.resolve_device")
    def test_fallback_to_device_count_when_no_gpu_count(self, mock_resolve, mock_torch):
        """When _gpu_count not provided, fall back to device_count()."""
        from model_inference import setup_model_for_inference

        mock_device = MagicMock()
        mock_device.type = "cuda"
        mock_resolve.return_value = mock_device
        mock_torch.cuda.is_available.return_value = True
        mock_torch.cuda.device_count.return_value = 4

        mock_model = MagicMock()
        mock_model.to.return_value = mock_model
        mock_dp = MagicMock()
        mock_torch.nn.DataParallel.return_value = mock_dp

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {}  # No _gpu_count — legacy/manual run

        result_model, result_device, effective_gpus = setup_model_for_inference(
            mock_model, chip_info, params
        )

        # Should fall back to device_count() = 4
        self.assertEqual(effective_gpus, 4)
        mock_torch.nn.DataParallel.assert_called_once()

    @patch("model_inference.torch")
    @patch("model_inference.HAS_TORCH", True)
    @patch("model_inference.resolve_device")
    def test_cpu_path_ignores_gpu_count(self, mock_resolve, mock_torch):
        """CPU path should return 1 regardless of _gpu_count."""
        from model_inference import setup_model_for_inference

        mock_device = MagicMock()
        mock_device.type = "cpu"
        mock_resolve.return_value = mock_device

        mock_model = MagicMock()
        mock_model.to.return_value = mock_model

        chip_info = {"chipType": "CPU", "chipName": "Intel Xeon"}
        params = {"_gpu_count": 4}

        result_model, result_device, effective_gpus = setup_model_for_inference(
            mock_model, chip_info, params
        )

        self.assertEqual(effective_gpus, 1)
        mock_torch.nn.DataParallel.assert_not_called()


if __name__ == "__main__":
    unittest.main()
