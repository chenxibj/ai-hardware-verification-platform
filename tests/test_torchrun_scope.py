"""Tests for #484 — torchrun should only be used for TRAINING eval types.

When eval_type is OPERATOR or MODEL (inference), even with multi-GPU DDP/FSDP,
the launch command must be python3, not torchrun.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent'))

from executor import TaskExecutor


class TestTorchrunScope(unittest.TestCase):
    """#484: torchrun must only be used for TRAINING eval types."""

    def setUp(self):
        self.executor = TaskExecutor.__new__(TaskExecutor)
        self.script = "/scripts/test.py"
        self.params = {"model": "resnet50"}

    def test_operator_multi_gpu_no_torchrun(self):
        """OPERATOR + multi-GPU + DDP → python3 (not torchrun)."""
        cmd = self.executor._build_launch_command(
            self.script, self.params, gpu_count=2, parallel_mode="DDP", eval_type="OPERATOR"
        )
        self.assertEqual(cmd[0], "python3")

    def test_inference_multi_gpu_no_torchrun(self):
        """MODEL (inference) + multi-GPU + DDP → python3 (not torchrun)."""
        cmd = self.executor._build_launch_command(
            self.script, self.params, gpu_count=4, parallel_mode="DDP", eval_type="MODEL"
        )
        self.assertEqual(cmd[0], "python3")

    def test_training_multi_gpu_uses_torchrun(self):
        """TRAINING + multi-GPU + DDP → torchrun."""
        cmd = self.executor._build_launch_command(
            self.script, self.params, gpu_count=4, parallel_mode="DDP", eval_type="TRAINING"
        )
        self.assertEqual(cmd[0], "torchrun")
        self.assertIn("--nproc_per_node=4", cmd)
        self.assertIn("--standalone", cmd)

    def test_training_single_gpu_no_torchrun(self):
        """TRAINING + single GPU + DDP → python3 (needs >1 GPU)."""
        cmd = self.executor._build_launch_command(
            self.script, self.params, gpu_count=1, parallel_mode="DDP", eval_type="TRAINING"
        )
        self.assertEqual(cmd[0], "python3")

    def test_training_no_parallel_mode_no_torchrun(self):
        """TRAINING + multi-GPU + no parallel mode → python3."""
        cmd = self.executor._build_launch_command(
            self.script, self.params, gpu_count=4, parallel_mode="", eval_type="TRAINING"
        )
        self.assertEqual(cmd[0], "python3")

    def test_model_training_multi_gpu_uses_torchrun(self):
        """MODEL_TRAINING + multi-GPU + FSDP → torchrun."""
        cmd = self.executor._build_launch_command(
            self.script, self.params, gpu_count=8, parallel_mode="FSDP", eval_type="MODEL_TRAINING"
        )
        self.assertEqual(cmd[0], "torchrun")
        self.assertIn("--nproc_per_node=8", cmd)

    def test_operator_multi_gpu_fsdp_no_torchrun(self):
        """OPERATOR + multi-GPU + FSDP → python3."""
        cmd = self.executor._build_launch_command(
            self.script, self.params, gpu_count=4, parallel_mode="FSDP", eval_type="OPERATOR"
        )
        self.assertEqual(cmd[0], "python3")


if __name__ == "__main__":
    unittest.main()
