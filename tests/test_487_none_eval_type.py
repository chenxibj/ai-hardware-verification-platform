"""TDD tests for #487: eval_type=None should not crash"""
import sys, os, unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "agent"))

class TestNoneEvalType(unittest.TestCase):
    def _make_executor(self):
        from executor import TaskExecutor
        cfg = {
            "platform": {"url": "http://localhost:8080/api", "token": "test"},
            "eval_scripts_dir": os.path.join(os.path.dirname(__file__), "..", "eval-scripts"),
            "project_root": os.path.join(os.path.dirname(__file__), ".."),
        }
        return TaskExecutor(cfg, node_id=1)

    def test_build_launch_command_none_eval_type(self):
        """#487: _build_launch_command with eval_type=None should not crash"""
        ex = self._make_executor()
        cmd = ex._build_launch_command("/tmp/test.py", {}, 4, "DDP", eval_type=None)
        # None eval_type -> not training -> python3
        self.assertEqual(cmd[0], "python3")

    def test_build_launch_command_none_parallel_mode(self):
        """#487: _build_launch_command with parallel_mode=None should not crash"""
        ex = self._make_executor()
        cmd = ex._build_launch_command("/tmp/test.py", {}, 4, None, eval_type="TRAINING")
        # None parallel_mode -> not DDP/FSDP -> python3
        self.assertEqual(cmd[0], "python3")

    def test_build_launch_command_both_none(self):
        """#487: both None should not crash"""
        ex = self._make_executor()
        cmd = ex._build_launch_command("/tmp/test.py", {}, 4, None, eval_type=None)
        self.assertEqual(cmd[0], "python3")

    def test_resolve_script_none_eval_type(self):
        """#487: _resolve_script with eval_type=None should raise ValueError not AttributeError"""
        ex = self._make_executor()
        with self.assertRaises(ValueError):
            ex._resolve_script(None, {})

if __name__ == "__main__":
    unittest.main()
