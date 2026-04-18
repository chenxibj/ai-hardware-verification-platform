"""Tests for #506: Agent 可观测性
- Progress extraction and reporting
- Async result reporting
- Flask threaded mode
- K8s metrics real data
"""
import json
import os
import re
import sys
import threading
import time
import unittest
from unittest.mock import patch, MagicMock, ANY

# Add agent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


class TestProgressExtraction(unittest.TestCase):
    """Test progress pattern extraction from log lines"""

    def _get_extract_progress(self):
        """Import the progress extraction function"""
        from executor import TaskExecutor
        return TaskExecutor._extract_progress

    def test_bracket_pattern(self):
        """[3/10] → 30%"""
        func = self._get_extract_progress()
        self.assertEqual(func("[3/10] Processing batch..."), 30)
        self.assertEqual(func("[1/5] Loading data"), 20)
        self.assertEqual(func("[10/10] Done"), 100)

    def test_percent_pattern(self):
        """45% → 45"""
        func = self._get_extract_progress()
        self.assertEqual(func("Progress: 45%"), 45)
        self.assertEqual(func("Download 100% complete"), 100)
        self.assertEqual(func("0% started"), 0)

    def test_epoch_pattern(self):
        """Epoch 3/10 → 30%"""
        func = self._get_extract_progress()
        self.assertEqual(func("Epoch 3/10, loss=0.5"), 30)
        self.assertEqual(func("epoch 1/4"), 25)

    def test_step_pattern(self):
        """Step 50/200 → 25%"""
        func = self._get_extract_progress()
        self.assertEqual(func("Step 50/200: training"), 25)

    def test_no_progress(self):
        """Lines without progress return None"""
        func = self._get_extract_progress()
        self.assertIsNone(func("Loading model weights..."))
        self.assertIsNone(func("INFO: Server started"))
        self.assertIsNone(func(""))

    def test_zero_denominator(self):
        """[0/0] should not crash"""
        func = self._get_extract_progress()
        result = func("[0/0] weird")
        # Should return None or handle gracefully
        self.assertTrue(result is None or isinstance(result, int))


class TestProgressReporting(unittest.TestCase):
    """Test progress throttling: report every 10% or 30 seconds"""

    def test_throttle_by_percentage(self):
        """Only report when progress changes by >= 10%"""
        from executor import ProgressReporter
        reporter = ProgressReporter(task_id=123, platform_url="http://test", token="tok")
        
        # Should report at 0 (first), then not again until 10+
        with patch.object(reporter, '_do_report') as mock_report:
            reporter.maybe_report(5)   # first report
            reporter.maybe_report(7)   # skip (only +2)
            reporter.maybe_report(15)  # report (+10 from 5)
            reporter.maybe_report(18)  # skip (+3 from 15)
            reporter.maybe_report(25)  # report (+10 from 15)
            
            self.assertEqual(mock_report.call_count, 3)

    def test_throttle_by_time(self):
        """Report if 30+ seconds since last report"""
        from executor import ProgressReporter
        reporter = ProgressReporter(task_id=123, platform_url="http://test", token="tok")
        
        with patch.object(reporter, '_do_report') as mock_report:
            with patch('time.time') as mock_time:
                mock_time.return_value = 1000.0
                reporter.maybe_report(5)   # first report, time=1000
                
                mock_time.return_value = 1010.0
                reporter.maybe_report(6)   # skip (only 10s, +1%)
                
                mock_time.return_value = 1035.0
                reporter.maybe_report(7)   # report (35s since last)
                
                self.assertEqual(mock_report.call_count, 3)


class TestAsyncResultReporter(unittest.TestCase):
    """Test that result reporting doesn't block worker thread"""

    def test_async_report_queue(self):
        """Result reports go through a background queue"""
        from executor import AsyncResultReporter
        
        reporter = AsyncResultReporter(platform_url="http://test", token="tok")
        reporter.start()
        
        try:
            with patch('requests.post') as mock_post:
                mock_post.return_value = MagicMock(status_code=200)
                
                # Submit a result — should not block
                start = time.time()
                reporter.submit(task_id=1, status="COMPLETED", result={"key": "val"}, logs="test logs")
                elapsed = time.time() - start
                
                # Worker thread should not block
                self.assertLess(elapsed, 1.0)
                
                # Wait for background processing
                time.sleep(1)
                mock_post.assert_called()
        finally:
            reporter.stop()

    def test_retry_on_failure(self):
        """Failed reports are retried in background"""
        from executor import AsyncResultReporter
        
        reporter = AsyncResultReporter(platform_url="http://test", token="tok")
        reporter.start()
        
        try:
            call_count = 0
            def side_effect(*args, **kwargs):
                nonlocal call_count
                call_count += 1
                if call_count < 3:
                    raise ConnectionError("network error")
                return MagicMock(status_code=200)
            
            with patch('requests.post', side_effect=side_effect):
                reporter.submit(task_id=1, status="COMPLETED", result={}, logs="")
                # Wait for retries
                time.sleep(5)
                self.assertGreaterEqual(call_count, 3)
        finally:
            reporter.stop()


class TestFlaskThreaded(unittest.TestCase):
    """Test Flask runs in threaded mode"""

    def test_threaded_or_production_server(self):
        """main.py should use threaded=True or a production WSGI server"""
        main_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "main.py")
        with open(main_path) as f:
            content = f.read()
        
        # Should have threaded=True or use waitress/gunicorn
        has_threaded = "threaded=True" in content
        has_waitress = "waitress" in content
        has_gunicorn = "gunicorn" in content
        
        self.assertTrue(has_threaded or has_waitress or has_gunicorn,
                       "Flask should run with threaded=True or use a production WSGI server")


class TestK8sMetricsReal(unittest.TestCase):
    """Test K8s metrics are real, not hardcoded"""

    def test_no_hardcoded_cpu_usage(self):
        """k8s_routes.py should NOT have hardcoded cpuUsage: 10.0"""
        k8s_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "k8s_routes.py")
        with open(k8s_path) as f:
            content = f.read()
        
        # The old hardcoded value
        self.assertNotIn('"cpuUsage": 10.0', content,
                        "cpuUsage should not be hardcoded to 10.0")

    def test_k8s_metrics_function_exists(self):
        """There should be a function to get real K8s metrics"""
        from k8s_routes import _get_k8s_node_metrics
        # Should be callable
        self.assertTrue(callable(_get_k8s_node_metrics))


if __name__ == "__main__":
    unittest.main()
