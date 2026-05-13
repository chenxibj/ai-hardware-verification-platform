#!/usr/bin/env python3
"""
TDD Tests for GPU Resource Management P1+P2 (#478)
Tests run against live API + DB to verify:
1. Agent register payload with gpuCount/gpuDetails → register success
2. After registration, gpu_slots table has N records (DB verify)
3. ComputeNode.gpuCount correctly saved (GET /api/nodes/{id} verify)
4. Heartbeat with GPU metrics → backend handles normally
5. Idempotent registration doesn't duplicate slots
6. No-GPU node registration works fine (gpuCount=0, no slots)
"""
import json
import os
import subprocess
import sys
import time
import requests

BASE_URL = "http://localhost:8080/api"
AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "test-token-for-ci")
HEADERS = {
    "Content-Type": "application/json",
    "X-Agent-Token": AGENT_TOKEN,
}

# Test login to get JWT for admin APIs
LOGIN_URL = f"{BASE_URL}/auth/login"

def get_auth_headers():
    resp = requests.post(LOGIN_URL, json={"email": "test@ahvp.com", "password": "Test1234"}, timeout=10)
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    token = data.get("data", {}).get("token")
    assert token, f"No token in login response: {data}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def db_query(sql):
    """Run SQL query against ahvp DB"""
    result = subprocess.run(
        ["docker", "exec", "ahvp-postgres", "psql", "-U", "ahvp", "-d", "ahvp", "-t", "-A", "-c", sql],
        capture_output=True, text=True, timeout=10
    )
    return result.stdout.strip()

def cleanup_test_node(name):
    """Remove test node by name for clean test runs"""
    db_query(f"DELETE FROM gpu_slots WHERE node_id IN (SELECT id FROM compute_nodes WHERE name = '{name}');")
    db_query(f"DELETE FROM compute_nodes WHERE name = '{name}';")

passed = 0
failed = 0
errors = []

def test(name, func):
    global passed, failed
    try:
        func()
        print(f"  ✅ {name}")
        passed += 1
    except AssertionError as e:
        print(f"  ❌ {name}: {e}")
        errors.append((name, str(e)))
        failed += 1
    except Exception as e:
        print(f"  💥 {name}: {type(e).__name__}: {e}")
        errors.append((name, f"{type(e).__name__}: {e}"))
        failed += 1

# ========== Tests ==========

def test_register_with_gpu_info():
    """Test 1: Register node with gpuCount and gpuDetails"""
    cleanup_test_node("test-gpu-node-478")
    
    gpu_details = [
        {"index": 0, "name": "NVIDIA L40S", "memory_total_mb": 46068, "memory_used_mb": 1024},
        {"index": 1, "name": "NVIDIA L40S", "memory_total_mb": 46068, "memory_used_mb": 512},
    ]
    hardware = json.dumps({
        "hostname": "test-gpu-host",
        "os": "Linux 5.15",
        "cpu_cores_logical": 16,
        "memory_total_gb": 64,
        "gpu_count": 2,
        "gpus": gpu_details,
        "gpu_name": "NVIDIA L40S",
    })
    
    payload = {
        "name": "test-gpu-node-478",
        "ipAddress": "10.0.0.99",
        "description": "Test GPU node for #478",
        "tags": "gpu,test",
        "agentPort": 8090,
        "hardwareInfo": hardware,
        "gpuCount": 2,
        "gpuDetails": gpu_details,
    }
    
    resp = requests.post(f"{BASE_URL}/nodes/register", json=payload, headers=HEADERS, timeout=10)
    assert resp.status_code == 200, f"Register failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data.get("code") == 0, f"Register error: {data}"
    node_data = data["data"]
    assert node_data.get("id"), f"No node ID returned: {node_data}"
    return node_data["id"]

def test_gpu_slots_created_after_register():
    """Test 2: After registration, gpu_slots table has correct records"""
    cleanup_test_node("test-gpu-node-478")
    node_id = test_register_with_gpu_info()
    
    count = db_query(f"SELECT count(*) FROM gpu_slots WHERE node_id = {node_id};")
    assert count == "2", f"Expected 2 GPU slots, got {count}"
    
    # Verify slot details
    slots = db_query(f"SELECT gpu_index, gpu_model, gpu_memory_gb, status FROM gpu_slots WHERE node_id = {node_id} ORDER BY gpu_index;")
    lines = [l for l in slots.split('\n') if l.strip()]
    assert len(lines) == 2, f"Expected 2 slot rows, got {len(lines)}: {slots}"
    
    # First slot should have index 0
    first = lines[0].split('|')
    assert first[0].strip() == "0", f"First slot index should be 0, got: {first[0]}"
    assert "L40S" in first[1], f"GPU model should contain L40S: {first[1]}"
    assert first[3].strip() == "FREE", f"Slot should be FREE: {first[3]}"

def test_compute_node_gpu_count_saved():
    """Test 3: ComputeNode.gpuCount correctly saved and returned via API"""
    cleanup_test_node("test-gpu-node-478")
    node_id = test_register_with_gpu_info()
    
    auth_headers = get_auth_headers()
    resp = requests.get(f"{BASE_URL}/nodes/{node_id}", headers=auth_headers, timeout=10)
    assert resp.status_code == 200, f"GET node failed: {resp.status_code} {resp.text}"
    data = resp.json()
    node = data.get("data", {})
    
    gpu_count = node.get("gpuCount")
    assert gpu_count == 2, f"Expected gpuCount=2, got {gpu_count}. Node data: {json.dumps(node, indent=2)[:500]}"

def test_heartbeat_with_gpu_metrics():
    """Test 4: Heartbeat with GPU metrics is handled normally"""
    cleanup_test_node("test-gpu-node-478")
    node_id = test_register_with_gpu_info()
    
    metrics = {
        "cpu_percent": 25.5,
        "memory_used_percent": 45.2,
        "memory_used_gb": 28.9,
        "memory_available_gb": 35.1,
        "disk_used_percent": 30.0,
        "load_1m": 1.5,
        "load_5m": 1.2,
        "load_15m": 1.0,
        "timestamp": int(time.time()),
        "gpu_count": 2,
        "gpus": [
            {"index": 0, "name": "NVIDIA L40S", "memory_total_mb": 46068, "memory_used_mb": 2048,
             "temperature_c": 45, "utilization_gpu_percent": 30, "power_draw_w": 120.5},
            {"index": 1, "name": "NVIDIA L40S", "memory_total_mb": 46068, "memory_used_mb": 1024,
             "temperature_c": 42, "utilization_gpu_percent": 10, "power_draw_w": 80.0},
        ]
    }
    
    resp = requests.post(f"{BASE_URL}/nodes/{node_id}/heartbeat", json=metrics, headers=HEADERS, timeout=10)
    assert resp.status_code == 200, f"Heartbeat failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data.get("code") == 0, f"Heartbeat error: {data}"

def test_idempotent_register_no_duplicate_slots():
    """Test 5: Re-registering same node doesn't duplicate slots"""
    cleanup_test_node("test-gpu-node-478")
    
    # First registration
    node_id = test_register_with_gpu_info()
    count1 = db_query(f"SELECT count(*) FROM gpu_slots WHERE node_id = {node_id};")
    
    # Second registration (same name)
    gpu_details = [
        {"index": 0, "name": "NVIDIA L40S", "memory_total_mb": 46068},
        {"index": 1, "name": "NVIDIA L40S", "memory_total_mb": 46068},
    ]
    payload = {
        "name": "test-gpu-node-478",
        "ipAddress": "10.0.0.99",
        "agentPort": 8090,
        "hardwareInfo": json.dumps({"gpu_count": 2, "gpus": gpu_details, "gpu_name": "NVIDIA L40S"}),
        "gpuCount": 2,
        "gpuDetails": gpu_details,
    }
    resp = requests.post(f"{BASE_URL}/nodes/register", json=payload, headers=HEADERS, timeout=10)
    assert resp.status_code == 200, f"Re-register failed: {resp.text}"
    
    count2 = db_query(f"SELECT count(*) FROM gpu_slots WHERE node_id = {node_id};")
    assert count1 == count2 == "2", f"Slots duplicated! Before: {count1}, After: {count2}"

def test_no_gpu_node_register():
    """Test 6: Node with no GPU registers fine, no slots created"""
    cleanup_test_node("test-cpu-node-478")
    
    payload = {
        "name": "test-cpu-node-478",
        "ipAddress": "10.0.0.100",
        "agentPort": 8090,
        "hardwareInfo": json.dumps({"hostname": "cpu-host", "os": "Linux", "cpu_cores_logical": 4}),
        "gpuCount": 0,
    }
    resp = requests.post(f"{BASE_URL}/nodes/register", json=payload, headers=HEADERS, timeout=10)
    assert resp.status_code == 200, f"Register failed: {resp.text}"
    data = resp.json()
    node_id = data["data"]["id"]
    
    count = db_query(f"SELECT count(*) FROM gpu_slots WHERE node_id = {node_id};")
    assert count == "0", f"Expected 0 GPU slots for CPU node, got {count}"
    
    cleanup_test_node("test-cpu-node-478")

# ========== Run Tests ==========
if __name__ == "__main__":
    print("\n🧪 GPU Resource Management P1+P2 Tests (#478)")
    print("=" * 60)
    
    # Cleanup before running
    cleanup_test_node("test-gpu-node-478")
    cleanup_test_node("test-cpu-node-478")
    
    test("1. Register with GPU info", test_register_with_gpu_info)
    test("2. GPU slots created after register", test_gpu_slots_created_after_register)
    test("3. ComputeNode.gpuCount saved", test_compute_node_gpu_count_saved)
    test("4. Heartbeat with GPU metrics", test_heartbeat_with_gpu_metrics)
    test("5. Idempotent register no duplicate slots", test_idempotent_register_no_duplicate_slots)
    test("6. No-GPU node register", test_no_gpu_node_register)
    
    # Cleanup after
    cleanup_test_node("test-gpu-node-478")
    cleanup_test_node("test-cpu-node-478")
    
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    if errors:
        print("\nFailed tests:")
        for name, err in errors:
            print(f"  - {name}: {err}")
    
    sys.exit(0 if failed == 0 else 1)
