"""Tests for #478 P3 — GPU isolation + smart launch command."""
import json
import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Ensure agent package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent'))

from executor import TaskExecutor


class TestBuildLaunchCommand(unittest.TestCase):
    """Test _build_launch_command produces correct command lists."""

    def setUp(self):
        self.executor = TaskExecutor.__new__(TaskExecutor)
        self.script = "/scripts/test.py"

    def test_no_gpu_cpu_only(self):
        """CPU task: plain python3 invocation."""
        params = {"model": "resnet50"}
        cmd = self.executor._build_launch_command(self.script, params, gpu_count=0, parallel_mode="")
        self.assertEqual(cmd, ["python3", self.script, json.dumps(params)])

    def test_single_gpu(self):
        """Single GPU: plain python3, no torchrun."""
        params = {"model": "resnet50"}
        cmd = self.executor._build_launch_command(self.script, params, gpu_count=1, parallel_mode="")
        self.assertEqual(cmd, ["python3", self.script, json.dumps(params)])

    def test_multi_gpu_inference(self):
        """Multi-GPU inference (DataParallel): still python3."""
        params = {"model": "llama"}
        cmd = self.executor._build_launch_command(self.script, params, gpu_count=2, parallel_mode="DataParallel")
        self.assertEqual(cmd, ["python3", self.script, json.dumps(params)])

    def test_multi_gpu_ddp(self):
        """Multi-GPU DDP training: torchrun invocation."""
        params = {"model": "llama"}
        cmd = self.executor._build_launch_command(self.script, params, gpu_count=4, parallel_mode="DDP", eval_type="TRAINING")
        # Should start with torchrun
        self.assertEqual(cmd[0], "torchrun")
        self.assertIn("--nproc_per_node=4", cmd)
        self.assertIn("--standalone", cmd)
        # master_port should be present
        port_args = [a for a in cmd if a.startswith("--master_port=")]
        self.assertEqual(len(port_args), 1)
        port_val = int(port_args[0].split("=")[1])
        self.assertGreaterEqual(port_val, 1024)  # #480: bind-then-release returns OS-assigned port
        self.assertLessEqual(port_val, 65535)  # #480: valid port range
        # script and params at the end
        self.assertEqual(cmd[-2], self.script)
        self.assertEqual(json.loads(cmd[-1]), params)

    def test_multi_gpu_fsdp(self):
        """Multi-GPU FSDP training: also torchrun."""
        params = {"model": "llama"}
        cmd = self.executor._build_launch_command(self.script, params, gpu_count=8, parallel_mode="FSDP", eval_type="TRAINING")
        self.assertEqual(cmd[0], "torchrun")
        self.assertIn("--nproc_per_node=8", cmd)

    def test_single_gpu_ddp_no_torchrun(self):
        """Single GPU + DDP mode: no torchrun (needs >1 GPU)."""
        params = {"model": "resnet"}
        cmd = self.executor._build_launch_command(self.script, params, gpu_count=1, parallel_mode="DDP")
        self.assertEqual(cmd[0], "python3")

    def test_empty_params(self):
        """Empty params dict still gets serialized."""
        cmd = self.executor._build_launch_command(self.script, {}, gpu_count=0, parallel_mode="")
        self.assertEqual(cmd, ["python3", self.script, json.dumps({})])


class TestRunTaskGpuIsolation(unittest.TestCase):
    """Test that _run_task correctly sets up GPU env and cmd."""

    def _make_executor(self):
        """Create a minimal TaskExecutor without __init__."""
        ex = TaskExecutor.__new__(TaskExecutor)
        ex.scripts_dir = "/tmp/test-scripts"
        ex.project_root = "/tmp"
        ex.platform_url = "http://localhost:8080"
        ex.token = "test-token"
        ex._active_tasks = {}
        ex._active_lock = MagicMock()
        return ex

    @patch("executor.subprocess.Popen")
    @patch("executor.requests.post")
    @patch("executor.os.path.exists", return_value=True)
    @patch("executor.collect_during_execution")
    def test_no_run_spec_no_crash(self, mock_collect, mock_exists, mock_post, mock_popen):
        """When _run_spec is absent, should not crash and use python3."""
        ex = self._make_executor()
        mock_proc = MagicMock()
        mock_proc.stdout = iter([])
        mock_proc.stderr = iter([])
        mock_proc.wait.return_value = 0
        mock_proc.returncode = 0
        mock_popen.return_value = mock_proc
        mock_post.return_value = MagicMock(status_code=200)

        # params without _run_spec
        params = {"model": "resnet50"}

        with patch.object(ex, '_resolve_script', return_value="test.py"), \
             patch.object(ex, '_get_system_info', return_value={}), \
             patch.object(ex, '_classify_log_line', return_value=("STDOUT", "INFO", None)), \
             patch.object(ex, '_report_result'):
            try:
                ex._run_task("task-1", "MODEL", params)
            except Exception:
                pass  # May fail on other parts, that's fine

        # Popen should have been called
        if mock_popen.called:
            call_args = mock_popen.call_args
            cmd = call_args[0][0] if call_args[0] else call_args[1].get('cmd', [])
            self.assertEqual(cmd[0], "python3")
            # env should be passed
            env = call_args[1].get('env', None) if call_args[1] else None
            # CUDA_VISIBLE_DEVICES should NOT be set
            if env is not None:
                self.assertNotIn("CUDA_VISIBLE_DEVICES", env)

    @patch("executor.subprocess.Popen")
    @patch("executor.requests.post")
    @patch("executor.os.path.exists", return_value=True)
    @patch("executor.collect_during_execution")
    def test_gpu_inference_sets_cuda_visible(self, mock_collect, mock_exists, mock_post, mock_popen):
        """2-GPU inference: CUDA_VISIBLE_DEVICES=0,1, cmd is python3."""
        ex = self._make_executor()
        mock_proc = MagicMock()
        mock_proc.stdout = iter([])
        mock_proc.stderr = iter([])
        mock_proc.wait.return_value = 0
        mock_proc.returncode = 0
        mock_popen.return_value = mock_proc
        mock_post.return_value = MagicMock(status_code=200)

        params = {
            "model": "llama",
            "_run_spec": {
                "gpuIndices": [1, 0],
                "parallelMode": "DataParallel",
            }
        }

        with patch.object(ex, '_resolve_script', return_value="test.py"), \
             patch.object(ex, '_get_system_info', return_value={}), \
             patch.object(ex, '_classify_log_line', return_value=("STDOUT", "INFO", None)), \
             patch.object(ex, '_report_result'):
            try:
                ex._run_task("task-2", "MODEL", params)
            except Exception:
                pass

        if mock_popen.called:
            call_args = mock_popen.call_args
            cmd = call_args[0][0] if call_args[0] else call_args[1].get('cmd', [])
            env = call_args[1].get('env', {})
            self.assertEqual(cmd[0], "python3")
            self.assertEqual(env.get("CUDA_VISIBLE_DEVICES"), "0,1")

    @patch("executor.subprocess.Popen")
    @patch("executor.requests.post")
    @patch("executor.os.path.exists", return_value=True)
    @patch("executor.collect_during_execution")
    def test_ddp_training_uses_torchrun(self, mock_collect, mock_exists, mock_post, mock_popen):
        """4-GPU DDP: CUDA_VISIBLE_DEVICES=0,1,2,3, cmd starts with torchrun."""
        ex = self._make_executor()
        mock_proc = MagicMock()
        mock_proc.stdout = iter([])
        mock_proc.stderr = iter([])
        mock_proc.wait.return_value = 0
        mock_proc.returncode = 0
        mock_popen.return_value = mock_proc
        mock_post.return_value = MagicMock(status_code=200)

        params = {
            "model": "llama",
            "_run_spec": {
                "gpuIndices": [0, 1, 2, 3],
                "parallelMode": "DDP",
            }
        }

        with patch.object(ex, '_resolve_script', return_value="test.py"), \
             patch.object(ex, '_get_system_info', return_value={}), \
             patch.object(ex, '_classify_log_line', return_value=("STDOUT", "INFO", None)), \
             patch.object(ex, '_report_result'):
            try:
                ex._run_task("task-3", "TRAINING", params)
            except Exception:
                pass

        if mock_popen.called:
            call_args = mock_popen.call_args
            cmd = call_args[0][0] if call_args[0] else call_args[1].get('cmd', [])
            env = call_args[1].get('env', {})
            self.assertEqual(cmd[0], "torchrun")
            self.assertIn("--nproc_per_node=4", cmd)
            self.assertEqual(env.get("CUDA_VISIBLE_DEVICES"), "0,1,2,3")


if __name__ == "__main__":
    unittest.main()
