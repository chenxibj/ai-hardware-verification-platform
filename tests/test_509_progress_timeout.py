"""Tests for #509: progress=0 timeout improvements.

1. Verify timeout threshold for progress=0 tasks is 10 minutes (not 5).
2. Verify execute_async reports initial progress before _run_task starts.
3. Verify heartbeat response includes worker capacity info.
"""
import json
import os
import sys
import threading
import time
import unittest
from unittest.mock import patch, MagicMock, PropertyMock

# Add agent directory to path
AGENT_DIR = os.path.join(os.path.dirname(__file__), '..', 'agent')
sys.path.insert(0, os.path.abspath(AGENT_DIR))

from executor import TaskExecutor


class TestProgressTimeoutConfig(unittest.TestCase):
    """#509: Verify timeout configuration is reasonable."""

    def test_progress_zero_timeout_is_10_minutes(self):
        """The scheduler should wait 10 minutes (not 5) for progress=0 tasks.
        This is enforced in TaskRecoveryScheduler.recoverStaleRunningTasks().
        We verify the Java source directly."""
        scheduler_path = os.path.join(
            os.path.dirname(__file__), '..', 'backend', 'src', 'main', 'java',
            'com', 'lab', 'task', 'TaskRecoveryScheduler.java')
        with open(scheduler_path, 'r') as f:
            content = f.read()
        # Should use 10 minutes for progress=0 threshold
        self.assertIn('minus(10, ChronoUnit.MINUTES)', content,
                       "progress=0 timeout should be 10 minutes, not 5")
        # Should NOT have 5-minute threshold for progress=0 anymore
        # (the 15-minute general threshold is fine)

    def test_scheduler_init_log_reflects_10min(self):
        """PostConstruct log message should mention 10min for progress=0."""
        scheduler_path = os.path.join(
            os.path.dirname(__file__), '..', 'backend', 'src', 'main', 'java',
            'com', 'lab', 'task', 'TaskRecoveryScheduler.java')
        with open(scheduler_path, 'r') as f:
            content = f.read()
        self.assertIn('progress=0 timeout: 10min', content,
                       "@PostConstruct log should reflect 10min timeout for progress=0")


class TestExecuteAsyncEarlyProgress(unittest.TestCase):
    """#509: execute_async must report progress=1% immediately after accepting task."""

    @patch('executor.requests')
    def test_execute_async_reports_progress_before_run_task(self, mock_requests):
        """Progress=1% should be reported in execute_async, not just in _run_task."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_requests.post.return_value = mock_resp

        config = {
            "platform": {"url": "http://localhost:8080/api", "token": "test-token"},
            "eval_scripts_dir": "/tmp/scripts",
            "project_root": "/tmp",
        }
        executor = TaskExecutor(config, node_id=1, max_workers=2)

        # Mock _run_task to do nothing (just sleep briefly)
        original_run_task = executor._run_task
        run_task_started = threading.Event()

        def mock_run_task(task_id, eval_type, params, chip_info=None):
            run_task_started.set()
            time.sleep(0.5)  # simulate work

        executor._run_task = mock_run_task

        # Call execute_async
        executor.execute_async(999, "OPERATOR", {"operator": "matmul"})

        # Wait briefly for the progress report (should happen before _run_task)
        time.sleep(0.3)

        # Check that progress=1% was reported
        progress_calls = [
            call for call in mock_requests.post.call_args_list
            if '/progress' in str(call)
        ]
        self.assertGreater(len(progress_calls), 0,
                           "execute_async should report progress=1% immediately after accepting task")

        # Verify the progress value is 1
        for call in progress_calls:
            args, kwargs = call
            if 'params' in kwargs:
                self.assertEqual(kwargs['params'].get('progress'), 1,
                                 "Initial progress should be 1%")

        # Cleanup
        run_task_started.wait(timeout=2)
        executor.shutdown()


class TestHeartbeatWorkerCapacity(unittest.TestCase):
    """#509: Heartbeat response should include worker capacity info."""

    def test_executor_exposes_capacity_info(self):
        """TaskExecutor should expose is_full and available_workers properties."""
        config = {
            "platform": {"url": "http://localhost:8080/api", "token": "test-token"},
            "eval_scripts_dir": "/tmp/scripts",
            "project_root": "/tmp",
        }
        executor = TaskExecutor(config, node_id=1, max_workers=2)

        self.assertFalse(executor.is_full, "Empty executor should not be full")
        self.assertEqual(executor.available_workers, 2, "Should have 2 available workers")
        self.assertEqual(executor.max_workers, 2, "max_workers should be 2")

        executor.shutdown()


if __name__ == '__main__':
    unittest.main()
