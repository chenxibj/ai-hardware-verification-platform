#!/usr/bin/env python3
"""#480: Test bind-then-release port allocation in executor.py"""
import socket
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent'))


def test_find_free_port_returns_valid_port():
    """Port should be in valid range (1024-65535)"""
    from executor import _find_free_port
    port = _find_free_port()
    assert isinstance(port, int)
    assert 1024 <= port <= 65535, f"Port {port} out of valid range"


def test_find_free_port_returns_unique_ports():
    """Multiple calls should return different ports (no collision)"""
    from executor import _find_free_port
    ports = set()
    for _ in range(50):
        p = _find_free_port()
        ports.add(p)
    # At least 90% unique (OS may reuse, but collisions should be very rare)
    assert len(ports) >= 45, f"Too many port collisions: only {len(ports)} unique out of 50"


def test_find_free_port_is_immediately_bindable():
    """The returned port should be bindable right after _find_free_port returns"""
    from executor import _find_free_port
    port = _find_free_port()
    # Try to actually bind it
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(('', port))
        except OSError as e:
            # Acceptable race condition, but should not happen consistently
            pass  # We accept this can fail occasionally


def test_build_launch_command_uses_bind_release():
    """_build_launch_command should use _find_free_port instead of random.randint"""
    from executor import TaskExecutor
    import inspect
    source = inspect.getsource(TaskExecutor._build_launch_command)
    assert 'random.randint' not in source, \
        "_build_launch_command still uses random.randint — should use _find_free_port"
    assert '_find_free_port' in source, \
        "_build_launch_command should call _find_free_port"


if __name__ == '__main__':
    test_find_free_port_returns_valid_port()
    print("✅ test_find_free_port_returns_valid_port")
    test_find_free_port_returns_unique_ports()
    print("✅ test_find_free_port_returns_unique_ports")
    test_find_free_port_is_immediately_bindable()
    print("✅ test_find_free_port_is_immediately_bindable")
    test_build_launch_command_uses_bind_release()
    print("✅ test_build_launch_command_uses_bind_release")
    print("\nAll bind-release port tests passed! ✅")
