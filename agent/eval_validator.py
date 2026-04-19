"""#521: Eval output JSON Schema validation module.

Provides validate_eval_output() to validate evaluation script output
against agent/schemas/eval_output.schema.json.
"""
import json
import os
import logging

logger = logging.getLogger(__name__)

# Lazy-load schema to avoid import-time file I/O
_SCHEMA = None
_SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schemas", "eval_output.schema.json")


class EvalValidationError(Exception):
    """Raised when eval output fails JSON Schema validation."""
    pass


def _load_schema():
    """Load and cache the JSON Schema."""
    global _SCHEMA
    if _SCHEMA is None:
        with open(_SCHEMA_PATH) as f:
            _SCHEMA = json.load(f)
    return _SCHEMA


def validate_eval_output(output):
    """Validate eval output against the JSON Schema.

    Args:
        output: dict or str (JSON string) — the eval script output to validate.

    Returns:
        True if validation passes.

    Raises:
        EvalValidationError: If validation fails, with a descriptive message.
    """
    try:
        from jsonschema import validate, ValidationError as JsonSchemaValidationError
    except ImportError:
        logger.warning("#521: jsonschema not installed, skipping validation")
        return True

    # Handle string input
    if isinstance(output, str):
        try:
            output = json.loads(output)
        except (json.JSONDecodeError, ValueError) as e:
            raise EvalValidationError(f"Output is not valid JSON: {e}")

    if not isinstance(output, dict):
        raise EvalValidationError(f"Output must be a dict, got {type(output).__name__}")

    schema = _load_schema()

    try:
        validate(instance=output, schema=schema)
    except JsonSchemaValidationError as e:
        # Build a human-readable error
        path = " -> ".join(str(p) for p in e.absolute_path) if e.absolute_path else "root"
        msg = f"Schema validation failed at '{path}': {e.message}"
        raise EvalValidationError(msg)

    return True


def build_no_data_result(raw_stdout, validation_error_msg):
    """Build a NO_DATA status result when schema validation fails.

    Args:
        raw_stdout: The original stdout from the eval script.
        validation_error_msg: The validation error message.

    Returns:
        dict with status=NO_DATA, raw_stdout (truncated), and validation_error.
    """
    MAX_STDOUT_LEN = 10000
    truncated = raw_stdout[:MAX_STDOUT_LEN] if len(raw_stdout) > MAX_STDOUT_LEN else raw_stdout

    return {
        "status": "NO_DATA",
        "raw_stdout": truncated,
        "validation_error": str(validation_error_msg),
    }
