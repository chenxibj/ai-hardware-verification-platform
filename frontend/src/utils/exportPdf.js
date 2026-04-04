/**
 * @file exportPdf.js
 * @description PDF 导出工具 — 基于 html2canvas + jsPDF
 * Issue: #142
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * 将 DOM 元素导出为 A4 尺寸的 PDF（自动分页）
 * @param {HTMLElement} element - 要截图的 DOM 元素
 * @param {string} filename - 保存的文件名（含 .pdf）
 */
export async function exportToPdf(element, filename = "report.pdf") {
  // 1. html2canvas 截图，scale=2 保证清晰度
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    // 忽略带有 data-html2canvas-ignore 属性的元素
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  // 2. A4 尺寸 (mm)
  const A4_WIDTH = 210;
  const A4_HEIGHT = 297;
  const MARGIN = 10; // 页边距 mm

  const contentWidth = A4_WIDTH - MARGIN * 2;
  const contentHeight = A4_HEIGHT - MARGIN * 2;

  // 图片在 PDF 中的宽高（按 A4 宽度等比缩放）
  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * contentWidth) / canvas.width;

  // 3. 创建 PDF
  const pdf = new jsPDF("p", "mm", "a4");

  let remainingHeight = imgHeight;
  let position = 0;

  // 首页
  pdf.addImage(imgData, "JPEG", MARGIN, MARGIN, imgWidth, imgHeight);
  remainingHeight -= contentHeight;

  // 分页
  while (remainingHeight > 0) {
    position -= contentHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", MARGIN, position + MARGIN, imgWidth, imgHeight);
    remainingHeight -= contentHeight;
  }

  // 4. 保存
  pdf.save(filename);
}

/**
 * 生成报告文件名
 * @param {string} chipName - 芯片名称
 * @returns {string} 文件名，如 "SenseX910-评价报告-20260404.pdf"
 */
export function generateReportFilename(chipName) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}${mm}${dd}`;
  const safeName = (chipName || "芯片报告").replace(/[\\/:*?"<>|]/g, "_");
  return `${safeName}-评价报告-${dateStr}.pdf`;
}
