"""#505 自愈三件套测试 — systemd加固 + 注册失败防护 + 网络故障隔离"""
import pytest
import json
import os
import sys
import time
import threading
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestRegistrationGuard:
    """#505-2: 注册失败时 /execute 返回 503"""

    def test_execute_unregistered_returns_503(self):
        """注册未完成（node_id=0）时 /execute 返回 503"""
        from main import app
        import main as main_mod
        original_node_info = main_mod.node_info
        original_executor = main_mod.executor
        try:
            main_mod.node_info = {"id": 0, "name": "test"}
            main_mod.executor = MagicMock()
            main_mod.executor.is_full = False
            with app.test_client() as client:
                resp = client.post('/execute',
                    json={"taskId": 1, "evalType": "OPERATOR"},
                    headers={'X-Agent-Token': 'ahvp-agent-secret-2026'})
                assert resp.status_code == 503, f"Expected 503, got {resp.status_code}"
                data = json.loads(resp.data)
                assert data["retryable"] is True
                assert "注册未完成" in data["message"]
        finally:
            main_mod.node_info = original_node_info
            main_mod.executor = original_executor

    def test_execute_none_node_returns_503(self):
        """node_info=None 时 /execute 返回 503"""
        from main import app
        import main as main_mod
        original_node_info = main_mod.node_info
        original_executor = main_mod.executor
        try:
            main_mod.node_info = None
            main_mod.executor = MagicMock()
            main_mod.executor.is_full = False
            with app.test_client() as client:
                resp = client.post('/execute',
                    json={"taskId": 1, "evalType": "OPERATOR"},
                    headers={'X-Agent-Token': 'ahvp-agent-secret-2026'})
                assert resp.status_code == 503
        finally:
            main_mod.node_info = original_node_info
            main_mod.executor = original_executor

    def test_execute_registered_passes(self):
        """注册完成后（node_id > 0）/execute 不返回 503"""
        from main import app
        import main as main_mod
        original_node_info = main_mod.node_info
        original_executor = main_mod.executor
        try:
            main_mod.node_info = {"id": 42, "name": "test-node"}
            mock_executor = MagicMock()
            mock_executor.is_full = False
            main_mod.executor = mock_executor
            with app.test_client() as client:
                resp = client.post('/execute',
                    json={"taskId": 1, "evalType": "OPERATOR"},
                    headers={'X-Agent-Token': 'ahvp-agent-secret-2026'})
                assert resp.status_code != 503, f"Registered node should not get 503, got {resp.status_code}"
        finally:
            main_mod.node_info = original_node_info
            main_mod.executor = original_executor


class TestNetworkFaultIsolation:
    """#505-3: 网络故障隔离"""

    def test_initial_state_connected(self):
        """初始状态为 connected"""
        import yaml
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
        with open(config_path) as f:
            config = yaml.safe_load(f)
        from heartbeat import HeartbeatThread
        hb = HeartbeatThread(1, config)
        assert hb._network_state == "connected"

    def test_consecutive_failures_disconnected(self):
        """连续 3 次心跳失败 → disconnected"""
        import yaml
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
        with open(config_path) as f:
            config = yaml.safe_load(f)
        from heartbeat import HeartbeatThread
        hb = HeartbeatThread(1, config)
        hb._do_re_register = MagicMock()

        hb._handle_failure("test failure 1")
        assert hb._network_state == "connected"
        hb._handle_failure("test failure 2")
        assert hb._network_state == "connected"
        hb._handle_failure("test failure 3")
        assert hb._network_state == "disconnected"

    def test_health_info_includes_network_state(self):
        """get_health_info 包含 network_state"""
        import yaml
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
        with open(config_path) as f:
            config = yaml.safe_load(f)
        from heartbeat import HeartbeatThread
        hb = HeartbeatThread(1, config)
        # Don't start the thread, just test the method directly
        info = hb.get_health_info()
        assert "network_state" in info
        assert info["network_state"] == "connected"

    def test_batch_poll_skipped_when_disconnected(self):
        """disconnected 时不 poll 新任务"""
        import yaml
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
        with open(config_path) as f:
            config = yaml.safe_load(f)
        from heartbeat import HeartbeatThread
        hb = HeartbeatThread(1, config)
        hb._network_state = "disconnected"
        mock_executor = MagicMock()
        mock_executor.available_workers = 4
        mock_executor.is_full = False
        hb.executor = mock_executor

        with patch('heartbeat.requests') as mock_requests:
            hb._batch_poll_tasks()
            mock_requests.post.assert_not_called()

    def test_cached_results_dir_constant(self):
        """CACHED_RESULTS_DIR 常量存在"""
        from heartbeat import CACHED_RESULTS_DIR
        assert CACHED_RESULTS_DIR == "/tmp/ahvp-cached-results"

    def test_save_cached_result(self):
        """_save_cached_result 缓存到文件"""
        import yaml
        import tempfile
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
        with open(config_path) as f:
            config = yaml.safe_load(f)
        from heartbeat import HeartbeatThread
        hb = HeartbeatThread(1, config)
        # Use a temp dir
        with patch('heartbeat.CACHED_RESULTS_DIR', tempfile.mkdtemp()) as tmp_dir:
            hb._save_cached_result("test-123", {"status": "COMPLETED", "result": {}})
            fpath = os.path.join(tmp_dir, "test-123.json")
            assert os.path.exists(fpath)
            with open(fpath) as f:
                data = json.load(f)
            assert data["status"] == "COMPLETED"
            # Cleanup
            os.remove(fpath)
            os.rmdir(tmp_dir)


class TestSystemdConfig:
    """#505-1: systemd 配置验证"""

    def test_dev_service_restart_always(self):
        """开发机 service: Restart=always"""
        with open("/etc/systemd/system/ahvp-agent.service") as f:
            content = f.read()
        assert "Restart=always" in content

    def test_dev_service_restart_sec_10(self):
        """开发机 service: RestartSec=10"""
        with open("/etc/systemd/system/ahvp-agent.service") as f:
            content = f.read()
        assert "RestartSec=10" in content

    def test_dev_service_start_limit(self):
        """开发机 service: StartLimitIntervalSec=300, StartLimitBurst=5"""
        with open("/etc/systemd/system/ahvp-agent.service") as f:
            content = f.read()
        assert "StartLimitIntervalSec=300" in content
        assert "StartLimitBurst=5" in content

    def test_dev_service_oom_score(self):
        """开发机 service: OOMScoreAdjust=-500"""
        with open("/etc/systemd/system/ahvp-agent.service") as f:
            content = f.read()
        assert "OOMScoreAdjust=-500" in content
