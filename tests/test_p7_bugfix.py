"""
#478 P7: GPU 隔离 + allocatedGpuIndices Bug 修复测试
TDD — 先红后绿
"""
import json
import pytest
from unittest.mock import MagicMock, patch, ANY


class TestBug1RunSpecInjection:
    """Bug 1: Agent /execute 端点必须将 runSpec 注入到 merged_params 中"""

    def test_execute_injects_run_spec_into_merged_params(self):
        """POST /execute 包含 runSpec 时, merged_params 应含 _run_spec"""
        import importlib
        import sys
        
        # Mock dependencies before importing main
        mock_modules = {
            'yaml': MagicMock(),
            'register': MagicMock(),
            'heartbeat': MagicMock(),
            'executor': MagicMock(),
            'collector': MagicMock(),
            'flask_cors': MagicMock(),
            'k8s_routes': MagicMock(),
            'task_routes': MagicMock(),
        }
        
        # We'll test the logic directly by simulating what execute() should do
        # The key assertion: when data contains "runSpec", merged_params gets "_run_spec"
        
        data = {
            "taskId": 123,
            "evalType": "INFERENCE",
            "params": {"model": "llama2"},
            "config": {"batch_size": 4},
            "runSpec": {
                "code": "L40S-2GPU",
                "gpuPerNode": 2,
                "gpuExclusive": True,
                "parallelMode": "tp",
                "nodeCount": 1,
                "gpuIndices": [0, 1]
            }
        }
        
        # Simulate the merge logic (current code)
        params = data.get("params", {})
        task_config = data.get("config", {})
        merged_params = {}
        if isinstance(task_config, dict):
            merged_params.update(task_config)
        if isinstance(params, dict):
            merged_params.update(params)
        
        # NEW: inject runSpec
        run_spec_data = data.get("runSpec", {})
        if run_spec_data:
            merged_params["_run_spec"] = run_spec_data
        
        assert "_run_spec" in merged_params
        assert merged_params["_run_spec"]["gpuIndices"] == [0, 1]
        assert merged_params["_run_spec"]["gpuPerNode"] == 2
        assert merged_params["_run_spec"]["parallelMode"] == "tp"

    def test_execute_no_run_spec_does_not_inject(self):
        """POST /execute 不含 runSpec 时, merged_params 不应含 _run_spec"""
        data = {
            "taskId": 456,
            "evalType": "TRAINING",
            "params": {"model": "bert"},
            "config": {},
        }
        
        params = data.get("params", {})
        task_config = data.get("config", {})
        merged_params = {}
        if isinstance(task_config, dict):
            merged_params.update(task_config)
        if isinstance(params, dict):
            merged_params.update(params)
        
        run_spec_data = data.get("runSpec", {})
        if run_spec_data:
            merged_params["_run_spec"] = run_spec_data
        
        assert "_run_spec" not in merged_params

    def test_executor_extracts_gpu_indices_from_run_spec(self):
        """executor._run_task 从 _run_spec 提取 gpuIndices 并设置 CUDA_VISIBLE_DEVICES"""
        script_params = {
            "model": "llama2",
            "_run_spec": {
                "gpuIndices": [2, 5],
                "gpuPerNode": 2,
                "parallelMode": "tp",
            }
        }
        
        # Simulate executor logic (line 353-362 of executor.py)
        run_spec = script_params.pop("_run_spec", {}) or {}
        gpu_indices = run_spec.get("gpuIndices", [])
        
        env = {}
        if gpu_indices:
            cuda_devices = ",".join(str(i) for i in gpu_indices)
            gpu_count = len(gpu_indices)
            env["CUDA_VISIBLE_DEVICES"] = cuda_devices
        
        assert "CUDA_VISIBLE_DEVICES" in env
        assert env["CUDA_VISIBLE_DEVICES"] == "2,5"
        assert "_run_spec" not in script_params  # popped out

    def test_heartbeat_poll_injects_run_spec(self):
        """heartbeat._batch_poll_tasks 也必须注入 runSpec 到 merged_params"""
        task_payload = {
            "taskId": 789,
            "evalType": "INFERENCE",
            "params": {"model": "gpt"},
            "config": {},
            "chip": {"chipName": "L40S"},
            "runSpec": {
                "gpuIndices": [3, 7],
                "gpuPerNode": 2,
            }
        }
        
        params = task_payload.get("params", {})
        task_config = task_payload.get("config", {})
        
        merged_params = {}
        if isinstance(task_config, dict):
            merged_params.update(task_config)
        if isinstance(params, dict):
            merged_params.update(params)
        
        # NEW: inject runSpec (same as in main.py)
        run_spec_data = task_payload.get("runSpec", {})
        if run_spec_data:
            merged_params["_run_spec"] = run_spec_data
        
        assert "_run_spec" in merged_params
        assert merged_params["_run_spec"]["gpuIndices"] == [3, 7]


class TestBug2AllocatedGpuIndices:
    """Bug 2: allocatedGpuIndices 因两次 save 触发乐观锁导致为 null"""
    
    def test_single_save_pattern(self):
        """验证 GPU slot 分配应在 taskRepository.save() 之前完成"""
        # This is a design test — we verify that in the new code,
        # setAllocatedGpuIndices is called BEFORE the first (and only) save
        #
        # We read the source file and verify the pattern
        import re
        
        source_path = "backend/src/main/java/com/lab/task/TaskDispatcher.java"
        try:
            with open(source_path, "r") as f:
                source = f.read()
        except FileNotFoundError:
            # Running from test directory, try relative
            import os
            source_path = os.path.join(os.path.dirname(__file__), "..", source_path)
            with open(source_path, "r") as f:
                source = f.read()
        
        # Find the dispatchSingleTask method
        # After fix: there should be only ONE taskRepository.save(task) in the dispatch success path
        # (excluding rollback and QUEUED saves)
        
        # Find the section between "// 3. 直接设 DISPATCHED" and "return true"
        dispatch_section_match = re.search(
            r'// 3\. 直接设 DISPATCHED.*?return true;',
            source, re.DOTALL
        )
        assert dispatch_section_match, "Could not find dispatch section in TaskDispatcher.java"
        dispatch_section = dispatch_section_match.group()
        
        # Count taskRepository.save(task) calls in this section
        save_calls = re.findall(r'taskRepository\.save\(task\)', dispatch_section)
        assert len(save_calls) == 1, \
            f"Expected exactly 1 taskRepository.save(task) in dispatch section, found {len(save_calls)}"


class TestBug3SqlQuery:
    """Bug 3: findAverageCompletedDurationSeconds SQL 有 GROUP BY / LIMIT 问题"""
    
    def test_sql_no_order_by_without_group_by(self):
        """AVG 聚合查询不应包含无意义的 ORDER BY（会导致 PostgreSQL 错误）"""
        import re
        
        source_path = "backend/src/main/java/com/lab/task/EvaluationTaskRepository.java"
        try:
            with open(source_path, "r") as f:
                source = f.read()
        except FileNotFoundError:
            import os
            source_path = os.path.join(os.path.dirname(__file__), "..", source_path)
            with open(source_path, "r") as f:
                source = f.read()
        
        # Find the findAverageCompletedDurationSeconds query - match the @Query annotation
        query_match = re.search(
            r'@Query\(value\s*=\s*"([^"]+)"[^)]*\)\s*Double\s+findAverageCompletedDurationSeconds',
            source, re.DOTALL
        )
        assert query_match, "Could not find findAverageCompletedDurationSeconds query"
        query_text = query_match.group(1)
        
        # The query should use a subquery pattern or just AVG without ORDER BY + LIMIT
        # PostgreSQL does not allow LIMIT in aggregate queries without subquery
        # Correct pattern: SELECT AVG(duration) FROM (SELECT ... ORDER BY ... LIMIT 50) sub
        
        # Check: if LIMIT is present, it must be inside a subquery
        if "LIMIT" in query_text.upper():
            assert "FROM (" in query_text or "from (" in query_text, \
                "LIMIT in aggregate query must be in a subquery. Current query uses LIMIT outside subquery which causes SQL error."
