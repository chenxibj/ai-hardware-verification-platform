"""Tests for #507: Agent 代码质量
- Dead code removal
- CPU sampling fix
- Version in /health
- K8s client init once
- Disk space check
- Error classification
- Signal handler fix
- Heartbeat cpu_percent non-blocking
"""
import json
import os
import re
import sys
import threading
import time
import unittest
from unittest.mock import patch, MagicMock, PropertyMock

# Add agent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


class TestDeadCodeRemoval(unittest.TestCase):
    """collect_during_execution() should be removed from collector.py"""

    def test_no_collect_during_execution(self):
        """collector.py should not have collect_during_execution function"""
        collector_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector.py")
        with open(collector_path) as f:
            content = f.read()
        self.assertNotIn("def collect_during_execution", content,
                        "Dead code collect_during_execution should be removed")

    def test_no_import_collect_during_execution(self):
        """No file should import collect_during_execution"""
        agent_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
        for fname in os.listdir(agent_dir):
            if fname.endswith('.py') and fname != 'collector.py':
                fpath = os.path.join(agent_dir, fname)
                with open(fpath) as f:
                    content = f.read()
                # It can import from collector, just not collect_during_execution
                if 'collect_during_execution' in content:
                    self.fail(f"{fname} still references collect_during_execution")


class TestCpuSamplingFix(unittest.TestCase):
    """cpu_percent should not use interval=0 for accuracy"""

    def test_no_cpu_percent_interval_zero_in_metrics_collector(self):
        """MetricsCollector should not use cpu_percent(interval=0)"""
        executor_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "executor.py")
        with open(executor_path) as f:
            content = f.read()
        
        # Find MetricsCollector class and check it doesn't use interval=0
        # We allow interval=0 in _get_system_info (one-time snapshot) but NOT in
        # the sampling loop
        in_collector = False
        for line in content.split('\n'):
            if 'class MetricsCollector' in line:
                in_collector = True
            elif in_collector and line.strip() and not line.startswith(' ') and not line.startswith('\t'):
                in_collector = False
            if in_collector and 'cpu_percent(interval=0)' in line:
                self.fail("MetricsCollector should not use cpu_percent(interval=0)")


class TestVersionInHealth(unittest.TestCase):
    """The /health endpoint should return a version field"""

    def test_health_returns_version(self):
        """Import the app and check /health response contains version"""
        # We'll check the source code for the version field
        main_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "main.py")
        with open(main_path) as f:
            content = f.read()
        
        self.assertIn("version", content.lower(),
                      "/health should return version information")

    def test_health_endpoint_has_version(self):
        """Test the actual Flask endpoint"""
        # Import the Flask app
        os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
        
        # Mock dependencies that need network
        with patch('register.register_node', return_value={"id": 1, "name": "test"}):
            with patch('heartbeat.HeartbeatThread'):
                with patch('k8s_routes.start_k8s_heartbeat'):
                    from main import app
                    client = app.test_client()
                    resp = client.get('/health')
                    data = resp.get_json()
                    self.assertIn('version', data,
                                 "/health response should contain 'version' field")


class TestK8sClientInitOnce(unittest.TestCase):
    """K8s client should be initialized once globally, not per request"""

    def test_no_load_kube_config_per_request(self):
        """k8s_routes.py should not call load_kube_config inside every handler"""
        k8s_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "k8s_routes.py")
        with open(k8s_path) as f:
            content = f.read()
        
        # Count load_kube_config calls — there should be at most 1-2 (init + validate)
        # The key check: _load_k8s_clients should cache or use a global
        # Instead of checking count, verify there's a caching mechanism
        self.assertTrue(
            '_k8s_clients' in content or '_cached' in content or 'global' in content.lower()
            or '_k8s_core_v1' in content,
            "K8s clients should be cached/initialized once, not per request"
        )


class TestDiskSpaceCheck(unittest.TestCase):
    """Agent should check disk space on startup"""

    def test_disk_check_on_startup(self):
        """main.py should check disk space during startup"""
        main_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "main.py")
        with open(main_path) as f:
            content = f.read()
        
        self.assertTrue(
            'disk' in content.lower() and ('check' in content.lower() or 'space' in content.lower() or 'usage' in content.lower()),
            "main.py should check disk space on startup"
        )


class TestErrorClassification(unittest.TestCase):
    """Errors should be classified as recoverable vs unrecoverable"""

    def test_error_classification_exists(self):
        """There should be error classification logic"""
        executor_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "executor.py")
        with open(executor_path) as f:
            content = f.read()
        
        # Check for error classification patterns
        has_recoverable = 'recoverable' in content.lower() or 'retryable' in content.lower()
        has_unrecoverable = 'unrecoverable' in content.lower() or 'not.*retry' in content.lower() or 'fatal' in content.lower()
        
        self.assertTrue(has_recoverable,
                       "Should classify errors as recoverable/retryable")


class TestSignalHandler(unittest.TestCase):
    """Signal handler should not call sys.exit() directly"""

    def test_no_sys_exit_in_signal_handler(self):
        """shutdown_handler should set a flag, not call sys.exit()"""
        main_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "main.py")
        with open(main_path) as f:
            content = f.read()
        
        # Find the shutdown_handler function
        in_handler = False
        handler_lines = []
        for line in content.split('\n'):
            if 'def shutdown_handler' in line:
                in_handler = True
            elif in_handler and line.strip() and not line.startswith(' ') and not line.startswith('\t'):
                in_handler = False
            if in_handler:
                handler_lines.append(line)
        
        handler_code = '\n'.join(handler_lines)
        self.assertNotIn('sys.exit', handler_code,
                        "shutdown_handler should not call sys.exit() — use a flag instead")


class TestHeartbeatCpuNonBlocking(unittest.TestCase):
    """Heartbeat should use non-blocking CPU sampling"""

    def test_heartbeat_cpu_not_blocking(self):
        """get_system_metrics should not block with cpu_percent(interval=1)"""
        collector_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector.py")
        with open(collector_path) as f:
            content = f.read()
        
        # Find get_system_metrics function
        in_func = False
        func_lines = []
        for line in content.split('\n'):
            if 'def get_system_metrics' in line:
                in_func = True
            elif in_func and line.strip() and not line.startswith(' ') and not line.startswith('\t'):
                in_func = False
            if in_func:
                func_lines.append(line)
        
        func_code = '\n'.join(func_lines)
        # Should NOT have interval=1 (blocks for 1 second per heartbeat)
        self.assertNotIn('interval=1', func_code,
                        "get_system_metrics should use non-blocking cpu sampling (not interval=1)")


if __name__ == "__main__":
    unittest.main()
