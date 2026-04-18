"""#503 Agent 安全加固测试 — token认证 + 敏感信息清理"""
import pytest
import json
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

VALID_TOKEN = 'ahvp-agent-secret-2026'


class TestTokenAuth:
    """#503: 所有端点 token 认证"""

    def test_health_no_token_200(self):
        """/health 无 token 返回 200（K8s liveness probe）"""
        from main import app
        with app.test_client() as client:
            resp = client.get('/health')
            assert resp.status_code == 200

    def test_status_no_token_401(self):
        """/status 无 token 返回 401"""
        from main import app
        with app.test_client() as client:
            resp = client.get('/status')
            assert resp.status_code == 401

    def test_status_wrong_token_401(self):
        """/status 错误 token 返回 401"""
        from main import app
        with app.test_client() as client:
            resp = client.get('/status', headers={'X-Agent-Token': 'wrong-token'})
            assert resp.status_code == 401

    def test_status_valid_token_200(self):
        """/status 正确 token 返回 200"""
        from main import app
        with app.test_client() as client:
            resp = client.get('/status', headers={'X-Agent-Token': VALID_TOKEN})
            assert resp.status_code == 200

    def test_execute_no_token_401(self):
        """/execute 无 token 返回 401"""
        from main import app
        with app.test_client() as client:
            resp = client.post('/execute', json={"taskId": 1, "evalType": "test"})
            assert resp.status_code == 401

    def test_k8s_no_token_401(self):
        """/api/k8s/* 无 token 返回 401"""
        from main import app
        with app.test_client() as client:
            resp = client.get('/api/k8s/cluster-info')
            assert resp.status_code == 401

    def test_k8s_valid_token_passes_auth(self):
        """/api/k8s/* 有 token 不返回 401（可能500因无k8s环境，但认证通过）"""
        from unittest.mock import patch
        from main import app
        # Mock k8s call to avoid hanging when no k8s cluster
        with patch('k8s_routes._load_k8s_clients', side_effect=Exception("no k8s")):
            with app.test_client() as client:
                resp = client.get('/api/k8s/cluster-info', headers={'X-Agent-Token': VALID_TOKEN})
                # Should not be 401 — auth passed, may be 500 (no k8s env)
                assert resp.status_code != 401, f"Valid token should pass auth, got {resp.status_code}"


class TestSensitiveInfoCleanup:
    """#503: 敏感信息清理"""

    def test_health_minimal(self):
        """/health 只返回 {"status": "healthy"}"""
        from main import app
        with app.test_client() as client:
            resp = client.get('/health')
            data = json.loads(resp.data)
            assert data == {"status": "healthy"}, f"Expected minimal health response, got: {data}"

    def test_status_no_node_id(self):
        """/status 不暴露 node_id"""
        from main import app
        with app.test_client() as client:
            resp = client.get('/status', headers={'X-Agent-Token': VALID_TOKEN})
            data = json.loads(resp.data)
            assert 'node_id' not in data, f"node_id should not be in /status: {data}"

    def test_status_no_config(self):
        """/status 不暴露 config 详情"""
        from main import app
        with app.test_client() as client:
            resp = client.get('/status', headers={'X-Agent-Token': VALID_TOKEN})
            data = json.loads(resp.data)
            assert 'node_name' not in data, f"node_name should not be in /status: {data}"
            assert 'metrics' not in data, f"metrics should not be in /status: {data}"
            assert 'current_task' not in data, f"current_task details should not be in /status: {data}"

    def test_status_has_basic_info(self):
        """/status 包含基本状态信息"""
        from main import app
        with app.test_client() as client:
            resp = client.get('/status', headers={'X-Agent-Token': VALID_TOKEN})
            data = json.loads(resp.data)
            assert 'status' in data
            assert 'busy' in data


class TestLegacyRemoved:
    """确认 #502 遗留的清理"""

    def test_task_routes_removed(self):
        """task_routes.py 已删除"""
        task_routes_path = os.path.join(os.path.dirname(__file__), '..', 'task_routes.py')
        assert not os.path.exists(task_routes_path)

    def test_no_db_password_in_code(self):
        """代码中无硬编码数据库密码"""
        agent_dir = os.path.join(os.path.dirname(__file__), '..')
        for fname in os.listdir(agent_dir):
            if fname.endswith('.py') and not fname.endswith('.bak503'):
                with open(os.path.join(agent_dir, fname)) as f:
                    content = f.read()
                    assert 'Ahvp@2026Secure' not in content, f"DB password found in {fname}!"
                    assert 'psycopg2' not in content, f"psycopg2 import found in {fname}!"
