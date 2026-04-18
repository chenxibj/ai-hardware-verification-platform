#!/usr/bin/env python3
"""
Tests for multi-GPU training support (DDP + torchrun) in model_training_benchmark.py
#478 P5 — TDD tests
"""
import sys, os
import unittest
from unittest.mock import patch, MagicMock
import torch

# Add eval-scripts to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "eval-scripts"))


class TestSetupDistributed(unittest.TestCase):
    """Test setup_distributed() function"""

    def test_setup_distributed_no_env(self):
        """Without RANK env var, should return (False, 0, 0, 1) — no DDP"""
        from model_training_benchmark import setup_distributed

        # Ensure RANK is not set
        env = os.environ.copy()
        for key in ("RANK", "LOCAL_RANK", "WORLD_SIZE"):
            env.pop(key, None)

        with patch.dict(os.environ, env, clear=True):
            is_ddp, rank, local_rank, world_size = setup_distributed()

        self.assertFalse(is_ddp)
        self.assertEqual(rank, 0)
        self.assertEqual(local_rank, 0)
        self.assertEqual(world_size, 1)

    def test_setup_distributed_with_env(self):
        """With RANK/LOCAL_RANK/WORLD_SIZE set, should init DDP and return correct values"""
        from model_training_benchmark import setup_distributed

        mock_env = {"RANK": "1", "LOCAL_RANK": "1", "WORLD_SIZE": "4",
                     "MASTER_ADDR": "localhost", "MASTER_PORT": "29500"}

        with patch.dict(os.environ, mock_env), \
             patch("torch.distributed.init_process_group") as mock_init, \
             patch("torch.cuda.set_device") as mock_set_device:
            is_ddp, rank, local_rank, world_size = setup_distributed()

        self.assertTrue(is_ddp)
        self.assertEqual(rank, 1)
        self.assertEqual(local_rank, 1)
        self.assertEqual(world_size, 4)
        mock_init.assert_called_once_with(backend="nccl", rank=1, world_size=4)
        mock_set_device.assert_called_once_with(1)


class TestWrapModelForTraining(unittest.TestCase):
    """Test wrap_model_for_training() function"""

    def _make_mock_model(self):
        """Create a mock model with .to() method that returns itself"""
        model = MagicMock(spec=torch.nn.Module)
        model.to.return_value = model
        return model

    def test_wrap_model_single_gpu(self):
        """Single GPU (no DDP, gpu_count<=1) should return model on cuda:0 or cpu"""
        from model_training_benchmark import wrap_model_for_training

        model = self._make_mock_model()
        # is_ddp=False, gpu_count=1 => single GPU path
        with patch("torch.cuda.is_available", return_value=True):
            result_model, result_device = wrap_model_for_training(
                model, is_ddp=False, local_rank=0, gpu_count=1)

        self.assertEqual(result_device, torch.device("cuda:0"))
        model.to.assert_called()
        # Should NOT be wrapped in DataParallel or DDP
        self.assertNotIsInstance(result_model, torch.nn.parallel.DataParallel)

    def test_wrap_model_cpu_fallback(self):
        """No CUDA available should fall back to CPU"""
        from model_training_benchmark import wrap_model_for_training

        model = self._make_mock_model()
        with patch("torch.cuda.is_available", return_value=False):
            result_model, result_device = wrap_model_for_training(
                model, is_ddp=False, local_rank=0, gpu_count=0)

        self.assertEqual(result_device, torch.device("cpu"))

    def test_wrap_model_ddp(self):
        """DDP mode should wrap with DistributedDataParallel"""
        from model_training_benchmark import wrap_model_for_training

        # Use a mock model to avoid actual CUDA .to() call
        model = self._make_mock_model()

        with patch("torch.nn.parallel.DistributedDataParallel") as MockDDP:
            mock_ddp_instance = MagicMock()
            MockDDP.return_value = mock_ddp_instance

            result_model, result_device = wrap_model_for_training(
                model, is_ddp=True, local_rank=0, gpu_count=2)

        self.assertEqual(result_device, torch.device("cuda:0"))
        MockDDP.assert_called_once()
        # Verify device_ids=[local_rank]
        call_kwargs = MockDDP.call_args
        self.assertEqual(call_kwargs[1]["device_ids"], [0])
        self.assertEqual(result_model, mock_ddp_instance)
        # model.to should have been called with cuda:0
        model.to.assert_called_with(torch.device("cuda:0"))

    def test_wrap_model_data_parallel(self):
        """gpu_count>1 + non-DDP should wrap with DataParallel"""
        from model_training_benchmark import wrap_model_for_training

        # Use a mock model to avoid actual CUDA .to() call
        model = self._make_mock_model()

        with patch("torch.nn.DataParallel") as MockDP,              patch("torch.cuda.is_available", return_value=True):
            mock_dp_instance = MagicMock()
            MockDP.return_value = mock_dp_instance

            result_model, result_device = wrap_model_for_training(
                model, is_ddp=False, local_rank=0, gpu_count=2)

        self.assertEqual(result_device, torch.device("cuda:0"))
        MockDP.assert_called_once()
        self.assertEqual(result_model, mock_dp_instance)
        # model.to should have been called with "cuda:0"
        model.to.assert_called_with("cuda:0")


class TestCreateDistributedDataloader(unittest.TestCase):
    """Test create_distributed_dataloader() function"""

    def test_distributed_dataloader_has_sampler(self):
        """DDP mode should use DistributedSampler"""
        from model_training_benchmark import create_distributed_dataloader

        X = torch.randn(100, 10)
        y = torch.randint(0, 2, (100,))

        loader = create_distributed_dataloader(
            X, y, batch_size=16, is_ddp=True, world_size=2, rank=0)

        self.assertIsInstance(loader, torch.utils.data.DataLoader)
        self.assertIsNotNone(loader.sampler)
        self.assertIsInstance(
            loader.sampler, torch.utils.data.distributed.DistributedSampler)

    def test_non_distributed_dataloader_no_sampler(self):
        """Non-DDP mode should use regular DataLoader with shuffle"""
        from model_training_benchmark import create_distributed_dataloader

        X = torch.randn(100, 10)
        y = torch.randint(0, 2, (100,))

        loader = create_distributed_dataloader(
            X, y, batch_size=16, is_ddp=False, world_size=1, rank=0)

        self.assertIsInstance(loader, torch.utils.data.DataLoader)
        # Should NOT have DistributedSampler
        self.assertNotIsInstance(
            loader.sampler, torch.utils.data.distributed.DistributedSampler)


class TestTrainingBenchmarkDDPIntegration(unittest.TestCase):
    """Integration tests: run_training_benchmark with DDP env mocked"""

    def test_run_training_benchmark_no_ddp_cpu(self):
        """Non-DDP CPU training should still work (regression test)"""
        from model_training_benchmark import run_training_benchmark

        # Ensure no DDP env vars
        env_clean = {k: v for k, v in os.environ.items()
                     if k not in ("RANK", "LOCAL_RANK", "WORLD_SIZE")}

        with patch.dict(os.environ, env_clean, clear=True):
            result = run_training_benchmark(
                "MLP-Small-Train",
                {"epochs": 2, "num_train_samples": 100, "num_val_samples": 20},
                torch.device("cpu"))

        self.assertIn("status", result)
        self.assertIn(result["status"], ("PASS", "WARN"))
        self.assertEqual(result["config"]["epochs"], 2)
        self.assertEqual(len(result["epochs"]), 2)
        # Verify summary exists
        self.assertIn("summary", result)
        self.assertIn("total_training_time_sec", result["summary"])

    def test_run_training_benchmark_output_has_gpu_count(self):
        """Output config should include gpu_count when set"""
        from model_training_benchmark import run_training_benchmark

        env_clean = {k: v for k, v in os.environ.items()
                     if k not in ("RANK", "LOCAL_RANK", "WORLD_SIZE")}

        with patch.dict(os.environ, env_clean, clear=True):
            result = run_training_benchmark(
                "MLP-Small-Train",
                {"epochs": 1, "num_train_samples": 50, "num_val_samples": 10,
                 "_gpu_count": 4},
                torch.device("cpu"))

        self.assertEqual(result["config"]["gpu_count"], 4)

    def test_run_training_benchmark_no_gpu_count_default_zero(self):
        """When _gpu_count not in params, config should have gpu_count=0"""
        from model_training_benchmark import run_training_benchmark

        env_clean = {k: v for k, v in os.environ.items()
                     if k not in ("RANK", "LOCAL_RANK", "WORLD_SIZE")}

        with patch.dict(os.environ, env_clean, clear=True):
            result = run_training_benchmark(
                "MLP-Small-Train",
                {"epochs": 1, "num_train_samples": 50, "num_val_samples": 10},
                torch.device("cpu"))

        self.assertEqual(result["config"]["gpu_count"], 0)

    def test_run_training_benchmark_resnet_no_ddp_cpu(self):
        """ResNet-50 should also work on CPU without DDP (regression)"""
        from model_training_benchmark import run_training_benchmark, HAS_TORCHVISION

        if not HAS_TORCHVISION:
            self.skipTest("torchvision not installed")

        env_clean = {k: v for k, v in os.environ.items()
                     if k not in ("RANK", "LOCAL_RANK", "WORLD_SIZE")}

        with patch.dict(os.environ, env_clean, clear=True):
            result = run_training_benchmark(
                "ResNet-50-Finetune",
                {"epochs": 1, "num_train_samples": 16, "num_val_samples": 4},
                torch.device("cpu"))

        self.assertIn(result["status"], ("PASS", "WARN"))


if __name__ == "__main__":
    unittest.main()
