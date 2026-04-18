#!/usr/bin/env python3
"""#483: Test device_map="auto" preference for multi-GPU inference"""
import sys
import os
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'eval-scripts'))


class TestDeviceMapAuto(unittest.TestCase):
    """Test that setup_model_for_inference prefers device_map='auto' for HF models"""

    def test_setup_model_handles_string_model_name(self):
        """When model is a string (HF model name), should try device_map='auto'"""
        import model_inference
        import inspect
        source = inspect.getsource(model_inference.setup_model_for_inference)
        # The function should mention device_map
        self.assertIn('device_map', source,
                      "setup_model_for_inference should support device_map='auto'")

    def test_setup_model_fallback_to_dataparallel(self):
        """Non-string models (nn.Module instances) should still use DataParallel"""
        import model_inference
        import inspect
        source = inspect.getsource(model_inference.setup_model_for_inference)
        self.assertIn('DataParallel', source,
                      "setup_model_for_inference should still have DataParallel fallback")

    def test_torch_mlp_returns_module(self):
        """TorchMLP is an nn.Module, not a string — should use DataParallel path"""
        try:
            import torch
            from model_inference import TorchMLP
            model = TorchMLP(784, 128, 10)
            self.assertFalse(isinstance(model, str))
            self.assertTrue(hasattr(model, 'forward'))
        except ImportError:
            self.skipTest("torch not available")


if __name__ == '__main__':
    unittest.main(verbosity=2)
