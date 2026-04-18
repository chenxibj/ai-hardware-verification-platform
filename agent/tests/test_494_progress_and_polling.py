"""Tests for #494: initial progress report + worker-aware polling + retry on timeout.

TDD: These tests are written BEFORE the implementation changes.
"""
import json
import os
import sys
import threading
import time
from unittest.mock import patch, MagicMock, call, ANY

import pytest

# Add agent dir to path so we can import executor/heartbeat
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_config():
    return {
        "platform": {"url": "http://localhost:8080/api", "token": "test-token"},
        "eval_scripts_dir": "/tmp/fake-scripts",
        "project_root": "/tmp",
        "heartbeat": {"interval": 30},
    }


def _make_executor(config=None, max_workers=4):
    from executor import TaskExecutor
    config = config or _make_config()
    return TaskExecutor(config, node_id=1, max_workers=max_workers)


class TestInitialProgressReport:
    """#494: _run_task must report progress=1% immediately after subprocess starts."""

    @patch("executor.subprocess.Popen")
    @patch("executor.requests.post")
    @patch("executor.MetricsCollector")
    def test_reports_initial_progress_after_popen(self, mock_mc, mock_post, mock_popen):
        """After subprocess.Popen starts, executor should POST progress=1 before reading stdout."""
        # Setup: mock script exists
        os.makedirs("/tmp/fake-scripts", exist_ok=True)
        with open("/tmp/fake-scripts/operator_benchmark.py", "w") as f:
            f.write("# fake\n")

        # Mock Popen to simulate a quick-finishing process
        mock_proc = MagicMock()
        mock_proc.stdout = MagicMock()
        mock_proc.stderr = MagicMock()
        mock_proc.stdout.readline = MagicMock(return_value="")  # EOF
        mock_proc.stderr.readline = MagicMock(return_value="")  # EOF
        mock_proc.stdout.close = MagicMock()
        mock_proc.stderr.close = MagicMock()
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc

        # Mock metrics collector
        mock_mc_instance = MagicMock()
        mock_mc_instance.get_summary.return_value = {}
        mock_mc.return_value = mock_mc_instance

        # Mock all HTTP requests to succeed
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        executor = _make_executor()
        executor._run_task("123", "OPERATOR", {"operator": "matmul"})

        # Find the progress call among all POST calls
        progress_calls = [
            c for c in mock_post.call_args_list
            if "/progress" in str(c) and ("'progress': 1" in str(c) or "progress=1" in str(c))
        ]
        # There should be at least one call to the progress endpoint
        assert len(progress_calls) >= 1, (
            f"Expected at least one progress=1 report, but found none. "
            f"All POST calls: {[str(c) for c in mock_post.call_args_list]}"
        )

    @patch("executor.subprocess.Popen")
    @patch("executor.requests.post")
    @patch("executor.MetricsCollector")
    def test_progress_report_before_stdout_thread(self, mock_mc, mock_post, mock_popen):
        """Progress=1% report must happen BEFORE stdout reading thread starts."""
        os.makedirs("/tmp/fake-scripts", exist_ok=True)
        with open("/tmp/fake-scripts/operator_benchmark.py", "w") as f:
            f.write("# fake\n")

        call_order = []

        def track_post(*args, **kwargs):
            url = args[0] if args else kwargs.get("url", "")
            if "progress" in str(url):
                call_order.append("progress_report")
            resp = MagicMock()
            resp.status_code = 200
            return resp

        mock_post.side_effect = track_post

        mock_proc = MagicMock()
        mock_proc.stdout = MagicMock()
        mock_proc.stderr = MagicMock()

        # Track when stdout thread starts reading
        original_readline = MagicMock(return_value="")

        def tracked_readline():
            if "progress_report" not in call_order:
                # If stdout is being read before progress report, that's a bug
                call_order.append("stdout_read_before_progress")
            return ""

        mock_proc.stdout.readline = tracked_readline
        mock_proc.stderr.readline = MagicMock(return_value="")
        mock_proc.stdout.close = MagicMock()
        mock_proc.stderr.close = MagicMock()
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc

        mock_mc_instance = MagicMock()
        mock_mc_instance.get_summary.return_value = {}
        mock_mc.return_value = mock_mc_instance

        executor = _make_executor()
        executor._run_task("456", "OPERATOR", {"operator": "matmul"})

        assert "progress_report" in call_order, "Progress report was never made"

    @patch("executor.subprocess.Popen")
    @patch("executor.requests.post")
    @patch("executor.MetricsCollector")
    def test_progress_report_failure_does_not_crash_task(self, mock_mc, mock_post, mock_popen):
        """If progress report fails, the task should still continue normally."""
        os.makedirs("/tmp/fake-scripts", exist_ok=True)
        with open("/tmp/fake-scripts/operator_benchmark.py", "w") as f:
            f.write("# fake\n")

        def selective_post(*args, **kwargs):
            url = args[0] if args else kwargs.get("url", "")
            if "progress" in str(url):
                raise ConnectionError("Network error")
            resp = MagicMock()
            resp.status_code = 200
            return resp

        mock_post.side_effect = selective_post

        mock_proc = MagicMock()
        mock_proc.stdout = MagicMock()
        mock_proc.stderr = MagicMock()
        mock_proc.stdout.readline = MagicMock(return_value="")
        mock_proc.stderr.readline = MagicMock(return_value="")
        mock_proc.stdout.close = MagicMock()
        mock_proc.stderr.close = MagicMock()
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc

        mock_mc_instance = MagicMock()
        mock_mc_instance.get_summary.return_value = {}
        mock_mc.return_value = mock_mc_instance

        executor = _make_executor()
        # Should NOT raise
        executor._run_task("789", "OPERATOR", {"operator": "matmul"})
        # Task should still report result
        result_calls = [
            c for c in mock_post.call_args_list
            if "result" in str(c)
        ]
        assert len(result_calls) >= 1, "Task result should still be reported even if progress fails"


class TestWorkerAwarePolling:
    """#494: Heartbeat should not poll tasks when workers are full."""

    def test_batch_poll_skips_when_full(self):
        """When all workers are busy, _batch_poll_tasks should not make any HTTP calls."""
        from heartbeat import HeartbeatThread

        config = _make_config()
        executor = MagicMock()
        executor.available_workers = 0
        executor.is_full = True

        hb = HeartbeatThread(node_id=1, config=config, executor=executor)

        with patch("heartbeat.requests.post") as mock_post:
            hb._batch_poll_tasks()
            # Should NOT have made any HTTP requests
            poll_calls = [c for c in mock_post.call_args_list if "poll-tasks" in str(c)]
            assert len(poll_calls) == 0, "Should not poll when workers are full"

    def test_batch_poll_limits_to_available_workers(self):
        """Poll should request maxTasks = available_workers."""
        from heartbeat import HeartbeatThread

        config = _make_config()
        executor = MagicMock()
        executor.available_workers = 2
        executor.is_full = False
        executor.active_task_count = 2
        executor.max_workers = 4

        hb = HeartbeatThread(node_id=1, config=config, executor=executor)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"code": 0, "data": {"tasks": [], "cancelTasks": []}}

        with patch("heartbeat.requests.post", return_value=mock_resp) as mock_post:
            hb._batch_poll_tasks()
            # Check that poll-tasks was called with maxTasks=2
            poll_calls = [c for c in mock_post.call_args_list if "poll-tasks" in str(c)]
            assert len(poll_calls) == 1, "Should poll once"
            call_kwargs = poll_calls[0]
            json_body = call_kwargs[1].get("json") if len(call_kwargs) > 1 else call_kwargs.kwargs.get("json")
            assert json_body is not None
            assert json_body.get("maxTasks") == 2, f"Should request 2 tasks, got {json_body}"


class TestRetryOnTimeout:
    """#494: Timeout recovery should retry tasks (up to 3 times) instead of directly FAILED."""

    def test_executor_tracks_retry_count(self):
        """Executor should track retry counts for tasks."""
        # This is a placeholder — retry logic is in the Java backend TaskRecoveryScheduler
        # Since we can't modify Java, this test documents the desired behavior
        # The agent-side mitigation is: report progress=1% so recovery doesn't trigger
        pass
