# Tests Directory

## Structure

| File | Type | Notes |
|------|------|-------|
| `run-all-tests.sh` | Shell BDD | MVP-0 tests (#152-#155). Requires running backend at `$BASE_URL`. **Partially outdated** — some JSON paths need updating as APIs evolve. |
| `test_gpu_*.py` / `test_*_gpu_*.py` | Python/pytest | GPU agent tests. Require `GPU_NODE` env var and real GPU hardware. Auto-skipped via `conftest.py` when not available. |
| `test_487_none_eval_type.py` | Python/pytest | Agent eval type handling |
| `test_509_progress_timeout.py` | Python/pytest | Agent timeout handling |
| `conftest.py` | Pytest config | Auto-skip GPU tests when `GPU_NODE` not set (#550) |

## Running Tests

```bash
# Run Python/pytest tests (GPU tests auto-skip without GPU_NODE)
cd tests && python -m pytest -v

# Run shell BDD tests (requires running backend)
API_BASE=http://localhost:8080/api bash tests/run-all-tests.sh

# Run Playwright E2E tests (requires running frontend)
npx playwright test --config=playwright.config.js

# Run report E2E (requires running backend)
API_BASE=http://localhost:8080/api bash e2e-tests/test-report-e2e.sh
```

## Known Issues (#550)

- Shell scripts (`run-all-tests.sh`, `test-report-e2e.sh`) have some outdated API path assertions
- GPU tests require real hardware — gracefully skipped in CI
- Credentials: use `test@ahvp.com` / `Test1234` (or `$TEST_PASSWORD` env)
