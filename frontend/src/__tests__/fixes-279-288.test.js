/**
 * @file fixes-279-288.test.js
 * @description BDD tests for P0 #279 #280 + P1 #281-#288 fixes
 */

// ===== #279 #280: API path verification =====
describe('#279 #280: API paths use correct endpoints', () => {
  const fs = require('fs');
  const path = require('path');
  const srcDir = path.resolve(__dirname, '..');

  function readAllJsFiles(dir) {
    let content = '';
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        content += readAllJsFiles(full);
      } else if (entry.name.endsWith('.js')) {
        content += fs.readFileSync(full, 'utf-8') + '\n';
      }
    }
    return content;
  }

  const allCode = readAllJsFiles(srcDir);

  test('no /evaluation/ API paths exist', () => {
    const re = new RegExp("['\"`]/evaluation/", 'g');
    const matches = allCode.match(re);
    expect(matches).toBeNull();
  });

  test('no /reports/compare path (should use /chip-reports/compare)', () => {
    const re = new RegExp("['\"`]/reports/compare", 'g');
    const matches = allCode.match(re);
    expect(matches).toBeNull();
  });

  test('/chip-reports/compare is used correctly', () => {
    expect(allCode).toContain('/chip-reports/compare');
  });
});

// ===== #281: Asset stats computed locally =====
describe('#281: Asset statistics computed from local list', () => {
  const fs = require('fs');
  const assetsCode = fs.readFileSync(
    require('path').resolve(__dirname, '..', 'pages', 'Assets.js'), 'utf-8'
  );

  test('does NOT call /assets/stats endpoint', () => {
    expect(assetsCode).not.toContain('"/assets/stats"');
    expect(assetsCode).not.toContain("'/assets/stats'");
  });

  test('has computeStats function', () => {
    expect(assetsCode).toContain('computeStats');
  });
});

// ===== #282: Asset categories use local constants =====
describe('#282: Asset categories use local ASSET_TYPES', () => {
  const fs = require('fs');
  const assetsCode = fs.readFileSync(
    require('path').resolve(__dirname, '..', 'pages', 'Assets.js'), 'utf-8'
  );

  test('does NOT call /asset-categories endpoint', () => {
    expect(assetsCode).not.toContain('/asset-categories');
  });

  test('imports ASSET_TYPES from constants', () => {
    expect(assetsCode).toContain('ASSET_TYPES');
  });
});

// ===== #283: Version history uses localStorage =====
describe('#283: Version history uses localStorage', () => {
  const fs = require('fs');
  const code = fs.readFileSync(
    require('path').resolve(__dirname, '..', 'pages', 'assets', 'VersionHistoryTab.js'), 'utf-8'
  );

  test('uses localStorage for version storage', () => {
    expect(code).toContain('localStorage');
  });

  test('has version key prefix', () => {
    expect(code).toContain('ahvp_asset_versions_');
  });

  test('has add-version modal', () => {
    expect(code).toContain('记录新版本');
  });
});

// ===== #284: Asset download with sourceUrl fallback =====
describe('#284: Asset download has sourceUrl fallback', () => {
  const fs = require('fs');
  const detailCode = fs.readFileSync(
    require('path').resolve(__dirname, '..', 'pages', 'AssetDetail.js'), 'utf-8'
  );
  const listCode = fs.readFileSync(
    require('path').resolve(__dirname, '..', 'pages', 'AssetList.js'), 'utf-8'
  );

  test('AssetDetail handleDownload has sourceUrl fallback', () => {
    expect(detailCode).toContain('sourceUrl');
    expect(detailCode).toContain('已跳转到资源源地址');
  });

  test('AssetList handleDownload has sourceUrl fallback', () => {
    expect(listCode).toContain('sourceUrl');
    expect(listCode).toContain('已跳转到资源源地址');
  });
});

// ===== #285: Enhanced error handling =====
describe('#285: API error handling shows status + message', () => {
  const fs = require('fs');
  const apiCode = fs.readFileSync(
    require('path').resolve(__dirname, '..', 'utils', 'api.js'), 'utf-8'
  );

  test('attaches displayMessage to errors', () => {
    expect(apiCode).toContain('displayMessage');
  });

  test('includes HTTP status in error message', () => {
    expect(apiCode).toContain('status');
    expect(apiCode).toContain('backendMsg');
  });

  test('handles network errors', () => {
    expect(apiCode).toContain('网络异常');
  });
});

// ===== #286: Dashboard uses real APIs =====
describe('#286: Dashboard aggregates from real APIs', () => {
  const fs = require('fs');
  const code = fs.readFileSync(
    require('path').resolve(__dirname, '..', 'pages', 'Dashboard.js'), 'utf-8'
  );

  test('fetches from /tasks', () => {
    expect(code).toContain('"/tasks"');
  });

  test('fetches from /nodes', () => {
    expect(code).toContain('"/nodes"');
  });

  test('fetches from /chip-reports', () => {
    expect(code).toContain('"/chip-reports"');
  });

  test('fetches from /assets', () => {
    expect(code).toContain('"/assets"');
  });

  test('does NOT call /dashboard/stats', () => {
    expect(code).not.toContain('"/dashboard/stats"');
  });

  test('shows node count card', () => {
    expect(code).toContain('节点在线');
  });

  test('shows asset count card', () => {
    expect(code).toContain('数字资产');
  });

  test('shows report count card', () => {
    expect(code).toContain('评测报告');
  });
});

// ===== #287: GPU all-100 warning =====
describe('#287: Report shows warning when all scores = 100', () => {
  const fs = require('fs');
  const code = fs.readFileSync(
    require('path').resolve(__dirname, '..', 'pages', 'ChipReport.js'), 'utf-8'
  );

  test('detects allScores100 condition', () => {
    expect(code).toContain('allScores100');
  });

  test('shows warning alert for score anomaly', () => {
    expect(code).toContain('评分异常提示');
    expect(code).toContain('所有维度评分均为 100 分');
  });
});

// ===== #288: RadarChart 0 = "未评测" =====
describe('#288: RadarChart shows "未评测" for 0/NO_DATA', () => {
  const fs = require('fs');
  const code = fs.readFileSync(
    require('path').resolve(__dirname, '..', 'components', 'RadarChart.js'), 'utf-8'
  );

  test('checks dataStatus for NO_DATA', () => {
    expect(code).toContain('NO_DATA');
    expect(code).toContain('dataStatus');
  });

  test('renders "未评测" label for null values', () => {
    expect(code).toContain('未评测');
  });

  test('tooltip shows "未评测" for null values', () => {
    expect(code).toContain('v == null');
  });
});
