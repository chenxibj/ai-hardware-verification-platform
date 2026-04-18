"""#504 进程管理改进测试 — 动态超时 + 进程组 kill + 无输出超时 + 资源限制"""
import pytest
import json
import os
import sys
import time
import signal
import subprocess
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestDynamicTimeout:
    """#504: 动态超时配置"""

    def test_timeout_map_constants(self):
        """TIMEOUT_MAP 常量正确定义"""
        from executor import TIMEOUT_MAP, DEFAULT_TIMEOUT, NO_OUTPUT_TIMEOUT
        assert TIMEOUT_MAP["OPERATOR"] == 300
        assert TIMEOUT_MAP["MODEL"] == 1200
        assert TIMEOUT_MAP["TRAINING"] == 7200
        assert DEFAULT_TIMEOUT == 600
        assert NO_OUTPUT_TIMEOUT == 120

    def test_get_timeout_operator(self):
        """OPERATOR 类型超时 300s"""
        from executor import TaskExecutor
        import yaml
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
        with open(config_path) as f:
            config = yaml.safe_load(f)
        executor = TaskExecutor(config, node_id=0)
        assert executor._get_timeout("OPERATOR", {}) == 300

    def test_get_timeout_model(self):
        """MODEL 类型超时 1200s"""
        from executor import TaskExecutor
        import yaml
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
        with open(config_path) as f:
            config = yaml.safe_load(f)
        executor = TaskExecutor(config, node_id=0)
        assert executor._get_timeout("MODEL", {}) == 1200

    def test_get_timeout_training(self):
        """TRAINING 类型超时 7200s"""
        from executor import TaskExecutor
        import yaml
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
        with open(config_path) as f:
            config = yaml.safe_load(f)
        executor = TaskExecutor(config, node_id=0)
        assert executor._get_timeout("TRAINING", {}) == 7200

    def test_get_timeout_explicit_override(self):
        """后端传入的 timeout 优先"""
        from executor import TaskExecutor
        import yaml
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
        with open(config_path) as f:
            config = yaml.safe_load(f)
        executor = TaskExecutor(config, node_id=0)
        # 即使是 OPERATOR 类型，如果传了 _timeout 也应用传入值
        assert executor._get_timeout("OPERATOR", {"_timeout": 999}) == 999

    def test_get_timeout_fallback(self):
        """未知类型 fallback 到 DEFAULT_TIMEOUT"""
        from executor import TaskExecutor, DEFAULT_TIMEOUT
        import yaml
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
        with open(config_path) as f:
            config = yaml.safe_load(f)
        executor = TaskExecutor(config, node_id=0)
        assert executor._get_timeout("UNKNOWN_TYPE", {}) == DEFAULT_TIMEOUT


class TestProcessGroupKill:
    """#504: 进程组 kill — start_new_session + os.killpg"""

    def test_popen_uses_start_new_session(self):
        """验证 Popen 使用 start_new_session=True"""
        # 通过源码检查
        import inspect
        from executor import TaskExecutor
        source = inspect.getsource(TaskExecutor._run_task)
        assert 'start_new_session=True' in source, "Popen should use start_new_session=True"

    def test_kill_uses_killpg(self):
        """验证 kill 使用 os.killpg"""
        import inspect
        from executor import TaskExecutor
        source = inspect.getsource(TaskExecutor._run_task)
        assert 'os.killpg' in source, "Kill should use os.killpg for process group kill"

    def test_process_group_kill_works(self):
        """实际测试进程组 kill 是否有效"""
        # 启动一个带子进程的脚本
        proc = subprocess.Popen(
            ["python3", "-c", "import time, subprocess; p=subprocess.Popen(['sleep','3600']); time.sleep(3600)"],
            start_new_session=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        time.sleep(0.5)  # 等子进程启动
        pgid = os.getpgid(proc.pid)
        # 杀掉进程组
        os.killpg(pgid, signal.SIGTERM)
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(pgid, signal.SIGKILL)
            proc.wait(timeout=3)
        assert proc.returncode is not None, "Process group should be killed"


class TestResourceLimits:
    """#504: 资源限制"""

    def test_set_task_limits_exists(self):
        """_set_task_limits 方法存在"""
        from executor import TaskExecutor
        assert hasattr(TaskExecutor, '_set_task_limits')

    def test_set_task_limits_callable(self):
        """_set_task_limits 是静态方法可调用"""
        from executor import TaskExecutor
        # 不抛异常即可（os.nice 在 root 下会成功）
        TaskExecutor._set_task_limits()

    def test_preexec_fn_used(self):
        """验证 Popen 使用 preexec_fn=_set_task_limits"""
        import inspect
        from executor import TaskExecutor
        source = inspect.getsource(TaskExecutor._run_task)
        assert 'preexec_fn=self._set_task_limits' in source


class TestNoOutputTimeout:
    """#504: 无输出超时"""

    def test_no_output_timeout_constant(self):
        """NO_OUTPUT_TIMEOUT 常量 = 120"""
        from executor import NO_OUTPUT_TIMEOUT
        assert NO_OUTPUT_TIMEOUT == 120

    def test_no_output_detection_in_source(self):
        """源码中包含无输出超时检测逻辑"""
        import inspect
        from executor import TaskExecutor
        source = inspect.getsource(TaskExecutor._run_task)
        assert 'NO_OUTPUT_TIMEOUT' in source
        assert 'no output' in source.lower() or 'no_output' in source.lower()
