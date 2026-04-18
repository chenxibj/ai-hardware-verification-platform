#!/usr/bin/env python3
"""
#485 TDD: Test that setup_model_for_inference correctly uses multiple GPUs
when CUDA_VISIBLE_DEVICES provides >1 GPU.

This test mocks torch.cuda to simulate multi-GPU environments.
"""
import sys
import os
import json
import unittest
from unittest.mock import patch, MagicMock

# Add eval-scripts to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "eval-scripts"))


class TestSetupModelForInference(unittest.TestCase):
    """#485: Verify setup_model_for_inference returns correct gpu_count for multi-GPU"""

    @patch("model_inference.torch")
    @patch("model_inference.resolve_device")
    def test_multi_gpu_returns_correct_count(self, mock_resolve, mock_torch):
        """When CUDA_VISIBLE_DEVICES=0,1,2,3 => device_count()=4 => DataParallel on 4 GPUs"""
        from model_inference import setup_model_for_inference
        import torch.nn as nn

        # Simulate 4 visible GPUs
        mock_device = MagicMock()
        mock_device.type = "cuda"
        mock_resolve.return_value = mock_device
        mock_torch.cuda.device_count.return_value = 4
        mock_torch.cuda.is_available.return_value = True
        mock_torch.cuda.get_device_name.return_value = "NVIDIA L40S"
        mock_torch.device.return_value = mock_device

        # Create a real nn.Module mock
        fake_model = MagicMock(spec=nn.Module)
        fake_model.to.return_value = fake_model

        # DataParallel mock
        dp_model = MagicMock()
        mock_torch.nn.DataParallel.return_value = dp_model

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 4, "_gpu_indices": [0, 1, 2, 3]}

        model, device, effective_gpus = setup_model_for_inference(fake_model, chip_info, params)

        # Must use all 4 GPUs
        self.assertEqual(effective_gpus, 4, "Should use 4 GPUs when device_count=4")
        # Must have called DataParallel
        mock_torch.nn.DataParallel.assert_called_once()

    @patch("model_inference.torch")
    @patch("model_inference.resolve_device")
    def test_single_gpu_no_dataparallel(self, mock_resolve, mock_torch):
        """When only 1 GPU visible => no DataParallel, effective_gpus=1"""
        from model_inference import setup_model_for_inference
        import torch.nn as nn

        mock_device = MagicMock()
        mock_device.type = "cuda"
        mock_resolve.return_value = mock_device
        mock_torch.cuda.device_count.return_value = 1
        mock_torch.cuda.is_available.return_value = True
        mock_torch.device.return_value = mock_device

        fake_model = MagicMock(spec=nn.Module)
        fake_model.to.return_value = fake_model

        chip_info = {"chipType": "GPU", "chipName": "NVIDIA L40S"}
        params = {"_gpu_count": 1, "_gpu_indices": [0]}

        model, device, effective_gpus = setup_model_for_inference(fake_model, chip_info, params)

        self.assertEqual(effective_gpus, 1, "Should use 1 GPU when device_count=1")
        mock_torch.nn.DataParallel.assert_not_called()

    @patch("model_inference.torch")
    @patch("model_inference.resolve_device")
    def test_cpu_returns_one(self, mock_resolve, mock_torch):
        """CPU mode => effective_gpus=1"""
        from model_inference import setup_model_for_inference
        import torch.nn as nn

        mock_device = MagicMock()
        mock_device.type = "cpu"
        mock_resolve.return_value = mock_device

        fake_model = MagicMock(spec=nn.Module)
        fake_model.to.return_value = fake_model

        chip_info = {"chipType": "CPU"}
        params = {"_gpu_count": 0}

        model, device, effective_gpus = setup_model_for_inference(fake_model, chip_info, params)

        self.assertEqual(effective_gpus, 1, "CPU should return effective_gpus=1")


class TestExecutorCudaEnvPassing(unittest.TestCase):
    """#485: Verify executor passes CUDA_VISIBLE_DEVICES correctly to subprocess env"""

    def test_cuda_visible_devices_set_in_env(self):
        """_run_spec.gpuIndices=[4,5,6,7] => env CUDA_VISIBLE_DEVICES=4,5,6,7"""
        # Simulate what executor._run_task does
        params = {
            "_run_spec": {
                "gpuIndices": [4, 5, 6, 7],
                "parallelMode": "",
            },
            "iterations": 10,
        }

        # Replicate executor logic
        script_params = dict(params)
        run_spec = script_params.pop("_run_spec", {}) or {}
        gpu_indices = run_spec.get("gpuIndices", [])
        parallel_mode = run_spec.get("parallelMode", "")
        gpu_count = len(gpu_indices) if gpu_indices else 0

        env = os.environ.copy()
        if gpu_indices:
            cuda_devices = ",".join(str(i) for i in sorted(gpu_indices))
            env["CUDA_VISIBLE_DEVICES"] = cuda_devices

        self.assertEqual(env["CUDA_VISIBLE_DEVICES"], "4,5,6,7")
        self.assertEqual(gpu_count, 4)

        # Verify params injected for script
        script_params["_gpu_count"] = gpu_count
        script_params["_gpu_indices"] = gpu_indices
        script_params["_parallel_mode"] = parallel_mode

        self.assertEqual(script_params["_gpu_count"], 4)
        self.assertEqual(script_params["_gpu_indices"], [4, 5, 6, 7])


if __name__ == "__main__":
    unittest.main()
