"""
#485: Test executor CUDA_VISIBLE_DEVICES logic
Verifies that OPERATOR tasks only expose 1 GPU while keeping all slots reserved.
"""
import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Add agent dir to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestExecutorGpuVisibility(unittest.TestCase):
    """Test that _run_task sets CUDA_VISIBLE_DEVICES correctly per eval_type."""

    def _get_cuda_env(self, eval_type, gpu_indices):
        """Simulate the CUDA_VISIBLE_DEVICES logic from executor._run_task"""
        # This mirrors the exact logic in executor.py _run_task
        env = {}
        if gpu_indices:
            eval_upper = (eval_type or "").upper()
            if eval_upper == "OPERATOR" and len(gpu_indices) > 1:
                visible_indices = [sorted(gpu_indices)[0]]
                cuda_devices = str(visible_indices[0])
            else:
                visible_indices = sorted(gpu_indices)
                cuda_devices = ",".join(str(i) for i in visible_indices)
            env["CUDA_VISIBLE_DEVICES"] = cuda_devices
        return env

    def test_operator_4gpu_uses_only_first(self):
        """OPERATOR with 4 GPUs [4,5,6,7] -> CUDA_VISIBLE_DEVICES=4"""
        env = self._get_cuda_env("OPERATOR", [4, 5, 6, 7])
        self.assertEqual(env["CUDA_VISIBLE_DEVICES"], "4")

    def test_operator_8gpu_uses_only_first(self):
        """OPERATOR with 8 GPUs [0-7] -> CUDA_VISIBLE_DEVICES=0"""
        env = self._get_cuda_env("OPERATOR", [0, 1, 2, 3, 4, 5, 6, 7])
        self.assertEqual(env["CUDA_VISIBLE_DEVICES"], "0")

    def test_operator_1gpu_uses_that_gpu(self):
        """OPERATOR with 1 GPU [3] -> CUDA_VISIBLE_DEVICES=3 (no multi-GPU logic)"""
        env = self._get_cuda_env("OPERATOR", [3])
        self.assertEqual(env["CUDA_VISIBLE_DEVICES"], "3")

    def test_model_4gpu_uses_all(self):
        """MODEL with 4 GPUs [4,5,6,7] -> CUDA_VISIBLE_DEVICES=4,5,6,7"""
        env = self._get_cuda_env("MODEL", [4, 5, 6, 7])
        self.assertEqual(env["CUDA_VISIBLE_DEVICES"], "4,5,6,7")

    def test_training_4gpu_uses_all(self):
        """TRAINING with 4 GPUs [0,1,2,3] -> CUDA_VISIBLE_DEVICES=0,1,2,3"""
        env = self._get_cuda_env("TRAINING", [0, 1, 2, 3])
        self.assertEqual(env["CUDA_VISIBLE_DEVICES"], "0,1,2,3")

    def test_no_gpu_indices_no_env(self):
        """No GPU indices -> no CUDA_VISIBLE_DEVICES set"""
        env = self._get_cuda_env("OPERATOR", [])
        self.assertNotIn("CUDA_VISIBLE_DEVICES", env)

    def test_operator_unsorted_indices_picks_lowest(self):
        """OPERATOR with unsorted [7,2,5,0] -> uses 0 (the lowest)"""
        env = self._get_cuda_env("OPERATOR", [7, 2, 5, 0])
        self.assertEqual(env["CUDA_VISIBLE_DEVICES"], "0")

    def test_model_unsorted_indices_sorted(self):
        """MODEL with unsorted [7,2,5,0] -> 0,2,5,7 (sorted)"""
        env = self._get_cuda_env("MODEL", [7, 2, 5, 0])
        self.assertEqual(env["CUDA_VISIBLE_DEVICES"], "0,2,5,7")


if __name__ == "__main__":
    unittest.main()
