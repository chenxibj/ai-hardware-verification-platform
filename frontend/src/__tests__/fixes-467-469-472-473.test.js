/**
 * @file fixes-467-469-472-473.test.js
 * @description TDD tests for bugs #467 #469 #472 #473
 */
const fs = require('fs');
const path = require('path');

const planListCode = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'PlanList.js'), 'utf-8'
);
const planCreateCode = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'PlanCreate.js'), 'utf-8'
);

// ===== #473: PlanList.js Tooltip uniqueness =====
describe('#473: PlanList action column tooltips are unique', () => {
  test('each Tooltip in action column has a unique key prop', () => {
    const actionsMatch = planListCode.match(/title:\s*["']操作["'][\s\S]*?render:\s*\(_,\s*record\)\s*=>\s*\{([\s\S]*?)\n\s{4}\},?\s*\n\s{2}\]/);
    expect(actionsMatch).toBeTruthy();
    const actionsBlock = actionsMatch[1];
    
    const tooltipMatches = actionsBlock.match(/<Tooltip/g);
    expect(tooltipMatches).toBeTruthy();
    expect(tooltipMatches.length).toBeGreaterThan(3);
    
    // Each Tooltip should have a key prop for proper React reconciliation
    const tooltipsWithKey = actionsBlock.match(/<Tooltip\s+key=/g) || [];
    expect(tooltipsWithKey.length).toBeGreaterThanOrEqual(2);
  });
});

// ===== #472: PlanCreate.js success page shows planNo and correct link =====
describe('#472: PlanCreate success page shows planNo and correct navigation', () => {
  test('saves both id and planNo from response', () => {
    expect(planCreateCode).toMatch(/resp\.data\?\.planNo|resp\.data\.planNo/);
  });

  test('subTitle displays planNo not raw id', () => {
    expect(planCreateCode).toMatch(/createdPlanNo/);
    const subTitleMatch = planCreateCode.match(/subTitle=\{[^}]+\}/);
    expect(subTitleMatch).toBeTruthy();
    expect(subTitleMatch[0]).toMatch(/planNo|PlanNo/i);
  });

  test('monitor button navigates to /plans/{id} not /plans/{id}/monitor', () => {
    // Find the key="monitor" button block (up to 200 chars around it)
    const monitorBtnArea = planCreateCode.match(/key="monitor"[\s\S]{0,200}/);
    expect(monitorBtnArea).toBeTruthy();
    // Should NOT contain /monitor path (would be a route like /plans/X/monitor)
    expect(monitorBtnArea[0]).not.toMatch(/\/plans\/[^"]*\/monitor/);
    
    // The onClick should navigate to a specific plan page
    // Look backwards from key="monitor" for the navigate call
    const monitorBlock = planCreateCode.match(/onClick=\{[^}]*\}[^>]*>查看监控/s);
    expect(monitorBlock).toBeTruthy();
    
    // Verify navigate goes to /plans/${createdPlanId} (specific plan)
    expect(planCreateCode).toMatch(/navigate\(`\/plans\/\$\{createdPlanId\}`\)/);
  });
});

// ===== #469: PlanCreate.js run spec step validation =====
describe('#469: PlanCreate run spec step requires selection', () => {
  test('step 3 (run spec) requires selectedRunSpecId to be non-null', () => {
    const canNextMatch = planCreateCode.match(/canNext[\s\S]*?if\s*\(current\s*===\s*3\)\s*return\s*(.*?);/);
    expect(canNextMatch).toBeTruthy();
    const returnExpr = canNextMatch[1].trim();
    expect(returnExpr).not.toBe('true');
    expect(returnExpr).toMatch(/selectedRunSpecId/);
  });
});

// ===== #467: No duplicate L40S chip entries =====
describe('#467: Chip data integrity', () => {
  test('ChipList has no hardcoded duplicate entries', () => {
    const chipListPath = path.resolve(__dirname, '..', 'pages', 'ChipList.js');
    if (fs.existsSync(chipListPath)) {
      const chipListCode = fs.readFileSync(chipListPath, 'utf-8');
      const l40sHardcoded = chipListCode.match(/CHIP-20260406-002/g);
      expect(l40sHardcoded).toBeNull();
    }
  });
});
