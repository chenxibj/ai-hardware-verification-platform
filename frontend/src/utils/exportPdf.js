/**
 * @file exportPdf.js
 * @description PDF/Excel 导出工具
 * Issue: #142 基础, #171 增强 (US-2.3)
 *
 * PDF增强: 配置选项（图表/原始数据/环境信息/水印/A4）
 * Excel导出: AHVP标准格式
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * PDF 导出配置默认值
 */
export const DEFAULT_PDF_OPTIONS = {
  includeCharts: true,      // 含图表
  includeRawData: false,     // 含原始数据
  includeEnvironment: true,  // 含环境信息
  watermark: "AHVP",         // 水印文字（空则无水印）
  pageSize: "a4",            // 页面大小
};

/**
 * 在 PDF 页面上添加水印
 */
function addWatermark(pdf, text, pageWidth, pageHeight) {
  if (!text) return;
  pdf.setFontSize(40);
  pdf.setTextColor(220, 220, 220);
  // 对角线水印
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;
  // jsPDF 不原生支持旋转文字，用简单方式添加
  pdf.setGState(new pdf.GState({ opacity: 0.08 }));
  pdf.setFontSize(60);
  pdf.text(text, centerX, centerY, { align: "center", angle: 45 });
  // 重置
  pdf.setGState(new pdf.GState({ opacity: 1 }));
  pdf.setTextColor(0, 0, 0);
}

/**
 * 将 DOM 元素导出为 A4 尺寸的 PDF（自动分页）
 * @param {HTMLElement} element - 要截图的 DOM 元素
 * @param {string} filename - 保存的文件名（含 .pdf）
 * @param {object} options - 导出配置选项
 */
export async function exportToPdf(element, filename = "report.pdf", options = {}) {
  const opts = { ...DEFAULT_PDF_OPTIONS, ...options };

  // html2canvas 截图
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    // 根据配置过滤元素
    ignoreElements: (el) => {
      if (!opts.includeCharts && el.getAttribute?.("data-export-type") === "chart") return true;
      if (!opts.includeRawData && el.getAttribute?.("data-export-type") === "raw-data") return true;
      if (!opts.includeEnvironment && el.getAttribute?.("data-export-type") === "environment") return true;
      if (el.getAttribute?.("data-html2canvas-ignore") != null) return true;
      return false;
    },
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  // A4 尺寸 (mm)
  const A4_WIDTH = 210;
  const A4_HEIGHT = 297;
  const MARGIN = 10;
  const contentWidth = A4_WIDTH - MARGIN * 2;
  const contentHeight = A4_HEIGHT - MARGIN * 2;

  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * contentWidth) / canvas.width;

  const pdf = new jsPDF("p", "mm", opts.pageSize || "a4");

  let remainingHeight = imgHeight;
  let position = 0;
  let pageNum = 1;

  // 首页
  pdf.addImage(imgData, "JPEG", MARGIN, MARGIN, imgWidth, imgHeight);
  if (opts.watermark) {
    try { addWatermark(pdf, opts.watermark, A4_WIDTH, A4_HEIGHT); } catch (_) {}
  }
  remainingHeight -= contentHeight;

  // 分页
  while (remainingHeight > 0) {
    position -= contentHeight;
    pdf.addPage();
    pageNum++;
    pdf.addImage(imgData, "JPEG", MARGIN, position + MARGIN, imgWidth, imgHeight);
    if (opts.watermark) {
      try { addWatermark(pdf, opts.watermark, A4_WIDTH, A4_HEIGHT); } catch (_) {}
    }
    remainingHeight -= contentHeight;
  }

  // 页脚
  const totalPages = pageNum;
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(`AHVP Report - Page ${i}/${totalPages}`, A4_WIDTH / 2, A4_HEIGHT - 5, { align: "center" });
  }

  pdf.save(filename);
}

/**
 * 生成报告文件名
 */
export function generateReportFilename(chipName, format = "pdf") {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}${mm}${dd}`;
  const safeName = (chipName || "芯片报告").replace(/[\\/:*?"<>|]/g, "_");
  return `${safeName}-评价报告-${dateStr}.${format}`;
}

/**
 * #171: Excel 导出 — AHVP 标准格式
 * 使用纯 CSV 格式（无需额外库），兼容 Excel 打开
 */
export function exportToExcel(reportData, chipName) {
  if (!reportData) return;

  const BOM = "\uFEFF"; // UTF-8 BOM for Excel
  const rows = [];

  // 标题
  rows.push(["AI软硬件验证平台 — 评测报告"]);
  rows.push([]);
  rows.push(["报告编号", reportData.reportNo || ""]);
  rows.push(["芯片", chipName || ""]);
  rows.push(["综合评分", reportData.overallScore != null ? reportData.overallScore.toFixed(1) : ""]);
  rows.push(["状态", reportData.status || ""]);
  rows.push(["创建时间", reportData.createdAt || ""]);
  rows.push([]);

  // 维度评分
  let dimScores = reportData.dimensionScores;
  if (typeof dimScores === "string") { try { dimScores = JSON.parse(dimScores); } catch (_) { dimScores = {}; } }
  if (dimScores && typeof dimScores === "object") {
    rows.push(["维度评分"]);
    rows.push(["维度", "评分"]);
    const dimMap = {
      compute_perf: "计算性能", memory_perf: "访存性能", math_func: "数学函数",
      attention: "Attention", normalization: "归一化", model_inference: "模型推理",
    };
    Object.entries(dimMap).forEach(([k, v]) => {
      rows.push([v, dimScores[k] != null ? dimScores[k].toFixed(1) : ""]);
    });
    rows.push([]);
  }

  // 算子排行
  let operators = reportData.operatorRanking;
  if (typeof operators === "string") { try { operators = JSON.parse(operators); } catch (_) { operators = []; } }
  if (Array.isArray(operators) && operators.length > 0) {
    rows.push(["算子排行"]);
    rows.push(["序号", "测试项", "评分", "通过", "平均延迟(ms)"]);
    operators.forEach((o, i) => {
      rows.push([
        i + 1,
        o.testItem || "",
        o.score != null ? o.score.toFixed(1) : "",
        o.passed ? "通过" : "失败",
        o.latencyMean != null ? o.latencyMean.toFixed(2) : "",
      ]);
    });
    rows.push([]);
  }

  // 瓶颈分析
  if (reportData.bottleneckAnalysis) {
    rows.push(["瓶颈分析"]);
    rows.push([reportData.bottleneckAnalysis]);
    rows.push([]);
  }

  // CSV
  const csv = BOM + rows.map(row => row.map(cell => {
    const str = String(cell == null ? "" : cell);
    return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
  }).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = generateReportFilename(chipName, "csv");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
