"""#521: Tests for eval output JSON Schema validation.

TDD Red → Green: These tests define the expected behavior of the schema
validation logic in executor.py.
"""
import json
import os
import sys
import pytest

# Ensure agent/ is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---- Schema file tests ----

def test_schema_file_exists():
    """Schema file must exist at agent/schemas/eval_output.schema.json"""
    schema_path = os.path.join(os.path.dirname(__file__), "..", "schemas", "eval_output.schema.json")
    assert os.path.exists(schema_path), f"Schema file not found: {schema_path}"


def test_schema_is_valid_json():
    """Schema file must be valid JSON"""
    schema_path = os.path.join(os.path.dirname(__file__), "..", "schemas", "eval_output.schema.json")
    with open(schema_path) as f:
        schema = json.load(f)
    assert "$schema" in schema
    assert "properties" in schema


# ---- Validation function tests ----

from eval_validator import validate_eval_output, EvalValidationError


class TestValidateEvalOutput:
    """Test the validate_eval_output() function."""

    def test_valid_operator_benchmark_output(self):
        """A well-formed operator benchmark output should pass validation."""
        output = {
            "benchmark_name": "operator_benchmark",
            "benchmark_version": "4.0",
            "timestamp": "2026-04-19T10:00:00",
            "results": [
                {"operator": "MatMul", "status": "PASS", "latency_ms_mean": 0.123, "throughput_qps": 8130.0}
            ],
            "summary": {
                "total_operators": 1,
                "passed": 1,
                "failed": 0,
                "pass_rate": 100.0,
                "avg_latency_ms": 0.123,
                "device": "cpu"
            },
            "conclusion": "Done"
        }
        # Should not raise
        result = validate_eval_output(output)
        assert result is True

    def test_valid_model_inference_output(self):
        """A well-formed model inference output should pass validation."""
        output = {
            "benchmark_name": "model_inference",
            "benchmark_version": "2.0",
            "timestamp": "2026-04-19T10:00:00",
            "results": [
                {"model": "MLP-Small", "status": "PASS", "latency_ms_mean": 1.5, "throughput_qps": 666.0}
            ],
            "summary": {
                "total_tests": 1,
                "passed": 1,
                "failed": 0,
                "pass_rate": 100.0,
                "avg_latency_ms": 1.5,
                "avg_throughput_qps": 666.0,
                "device": "cpu"
            },
            "conclusion": "Done"
        }
        result = validate_eval_output(output)
        assert result is True

    def test_valid_training_output(self):
        """A well-formed training benchmark output should pass validation."""
        output = {
            "benchmark_name": "model_training_benchmark",
            "benchmark_version": "1.0",
            "results": [
                {"model": "MLP", "status": "PASS"}
            ],
            "summary": {
                "total_models": 1,
                "passed": 1,
                "failed": 0,
                "pass_rate": 100.0,
                "total_training_time_sec": 10.5,
                "avg_throughput_samples_per_sec": 100.0,
                "device": "cpu"
            }
        }
        result = validate_eval_output(output)
        assert result is True

    def test_missing_benchmark_name(self):
        """Missing benchmark_name should fail validation."""
        output = {
            "results": [{"status": "PASS"}],
            "summary": {"total_operators": 1, "passed": 1, "failed": 0}
        }
        with pytest.raises(EvalValidationError) as exc_info:
            validate_eval_output(output)
        assert "benchmark_name" in str(exc_info.value).lower()

    def test_missing_results(self):
        """Missing results array should fail validation."""
        output = {
            "benchmark_name": "test",
            "summary": {"total_operators": 1, "passed": 1, "failed": 0}
        }
        with pytest.raises(EvalValidationError) as exc_info:
            validate_eval_output(output)
        assert "results" in str(exc_info.value).lower()

    def test_missing_summary(self):
        """Missing summary should fail validation."""
        output = {
            "benchmark_name": "test",
            "results": [{"status": "PASS"}]
        }
        with pytest.raises(EvalValidationError) as exc_info:
            validate_eval_output(output)
        assert "summary" in str(exc_info.value).lower()

    def test_empty_results_array(self):
        """Empty results array should fail (minItems: 1)."""
        output = {
            "benchmark_name": "test",
            "results": [],
            "summary": {"total_operators": 0, "passed": 0, "failed": 0}
        }
        with pytest.raises(EvalValidationError):
            validate_eval_output(output)

    def test_invalid_status_in_results(self):
        """Invalid status value in result entry should fail."""
        output = {
            "benchmark_name": "test",
            "results": [{"status": "UNKNOWN"}],
            "summary": {"total_operators": 1, "passed": 0, "failed": 1}
        }
        with pytest.raises(EvalValidationError):
            validate_eval_output(output)

    def test_negative_latency_fails(self):
        """Negative latency_ms_mean should fail validation."""
        output = {
            "benchmark_name": "test",
            "results": [{"status": "PASS", "latency_ms_mean": -1.0}],
            "summary": {"total_operators": 1, "passed": 1, "failed": 0}
        }
        with pytest.raises(EvalValidationError):
            validate_eval_output(output)

    def test_extra_fields_allowed(self):
        """Extra fields should be allowed (additionalProperties: true)."""
        output = {
            "benchmark_name": "test",
            "benchmark_version": "1.0",
            "results": [{"status": "PASS", "extra_field": "ok", "latency_ms_mean": 1.0}],
            "summary": {"total_operators": 1, "passed": 1, "failed": 0},
            "custom_field": "hello"
        }
        result = validate_eval_output(output)
        assert result is True

    def test_output_with_custom_metrics(self):
        """Optional custom_metrics object should pass."""
        output = {
            "benchmark_name": "test",
            "results": [{"status": "PASS"}],
            "summary": {"total_operators": 1, "passed": 1, "failed": 0},
            "custom_metrics": {"my_metric": 42.0}
        }
        result = validate_eval_output(output)
        assert result is True

    def test_not_a_dict_fails(self):
        """Non-dict input should fail validation."""
        with pytest.raises(EvalValidationError):
            validate_eval_output("not a dict")

    def test_not_json_parseable_string(self):
        """A non-JSON string input should fail validation."""
        with pytest.raises(EvalValidationError):
            validate_eval_output("this is not json")


class TestBuildNoDataResult:
    """Test the build_no_data_result() helper for schema validation failures."""

    from eval_validator import build_no_data_result

    def test_no_data_result_structure(self):
        """NO_DATA result should have status=NO_DATA and raw_stdout."""
        from eval_validator import build_no_data_result
        result = build_no_data_result("some raw output", "validation error msg")
        assert result["status"] == "NO_DATA"
        assert result["raw_stdout"] == "some raw output"
        assert "validation error msg" in result["validation_error"]

    def test_no_data_result_truncates_long_stdout(self):
        """raw_stdout should be truncated if too long."""
        from eval_validator import build_no_data_result
        long_output = "x" * 20000
        result = build_no_data_result(long_output, "err")
        assert len(result["raw_stdout"]) <= 10000
