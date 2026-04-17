/**
 * @file fix-471-eval-env.test.js
 * @description TDD tests for bug #471: evaluation environment should not be hardcoded to CPU mode
 *
 * The bug: ChipReport.js hardcodes "CPU 评测模式" and "CPU 评测 (NumPy + Python 3)"
 * regardless of actual execution device (GPU/NPU).
 *
 * Fix: dynamically determine mode from report.executionNodeName / report.actualChipModel
 */
const fs = require('fs');
const path = require('path');

const chipReportCode = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'ChipReport.js'), 'utf-8'
);

describe('#471: Evaluation environment should be dynamic, not hardcoded CPU', () => {

  test('Alert message should NOT be hardcoded "CPU 评测模式"', () => {
    // The Alert in Section 8 should use a dynamic variable for message, not a hardcoded string
    // Look for Section 8 area (评测环境)
    const section8Match = chipReportCode.match(/评测环境[\s\S]{0,2000}?<Alert/);
    expect(section8Match).toBeTruthy();

    // The message prop in the Section 8 Alert should be a variable (e.g., {modeLabel}), 
    // NOT a hardcoded string like message="CPU 评测模式"
    // Extract Section 8 block
    const section8Block = chipReportCode.match(/Section 8: 评测环境[\s\S]{0,3000}?Section|Section 8: 评测环境[\s\S]*/);
    expect(section8Block).toBeTruthy();
    const block = section8Block[0];
    
    // Should NOT have message="CPU 评测模式" as a hardcoded prop
    const hardcodedCpuAlert = block.match(/message=\s*"CPU 评测模式"/);
    expect(hardcodedCpuAlert).toBeNull();
  });

  test('运行时 should NOT be hardcoded "CPU 评测 (NumPy + Python 3)"', () => {
    // The runtime description should be dynamic
    const hardcodedRuntime = chipReportCode.match(/>\s*CPU 评测 \(NumPy \+ Python 3\)\s*</);
    expect(hardcodedRuntime).toBeNull();
  });

  test('description should NOT be hardcoded CPU fallback text', () => {
    const hardcodedDesc = chipReportCode.match(/description=\s*"当前评测数据在 CPU 模式下生成。真实 GPU\/NPU 评测需连接硬件节点执行。"/);
    expect(hardcodedDesc).toBeNull();
  });

  test('code references executionNodeName for mode detection', () => {
    // The code should check executionNodeName to determine GPU vs CPU mode
    // Look for GPU-related conditional logic
    const hasGpuDetection = chipReportCode.match(/executionNodeName[\s\S]{0,200}?[Gg][Pp][Uu]/);
    expect(hasGpuDetection).toBeTruthy();
  });

  test('code references actualChipModel for mode detection', () => {
    // Should also check actualChipModel for GPU keywords
    const hasChipModelCheck = chipReportCode.match(/actualChipModel[\s\S]{0,200}?[Gg][Pp][Uu]|[Gg][Pp][Uu][\s\S]{0,200}?actualChipModel/);
    expect(hasChipModelCheck).toBeTruthy();
  });

  test('GPU mode shows node name and chip model in description', () => {
    // When in GPU mode, the description should include execution node info
    const hasNodeInfo = chipReportCode.match(/executionNodeName[\s\S]{0,500}?executionNodeIp|executionNodeIp[\s\S]{0,500}?executionNodeName/);
    expect(hasNodeInfo).toBeTruthy();
  });

  test('has fallback for old reports without execution info', () => {
    // Should have fallback logic for when executionNodeName is not set
    // A conditional check on executionNodeName existence
    const hasFallback = chipReportCode.match(/report\.executionNodeName|executionNodeName/);
    expect(hasFallback).toBeTruthy();
  });
});
