export type CategoryChoice = { id: string; name: string; kind: string };
export type HistoryExample = { note: string | null; categoryId: string | null; kind: string };
export type CategorySuggestion = { categoryId: string | null; confidence: number; reason: string; source: "HISTORY" | "RULE" | "AI" | "UNKNOWN" };

export function normalizedDescription(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase()
    .replace(/\b\d+\b/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}
export function redactDescription(value: string) {
  return value.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]").replace(/(?:\d[ .-]?){7,}/g, "[số tài khoản]").slice(0, 300);
}
const keywords = [
  { category: ["an uong", "thuc pham"], words: ["cafe", "coffee", "highlands", "phuc long", "grabfood", "com", "pho", "bun", "nha hang", "sieu thi"] },
  { category: ["di lai", "di chuyen", "giao thong"], words: ["grab", "be bike", "taxi", "xang", "gui xe"] },
  { category: ["mua sam"], words: ["shopee", "lazada", "tiki", "quan ao"] },
  { category: ["nha o", "hoa don"], words: ["tien dien", "evn", "tien nuoc", "internet", "tien nha"] },
  { category: ["suc khoe", "y te"], words: ["benh vien", "nha thuoc", "phong kham"] },
  { category: ["giao duc", "hoc tap"], words: ["hoc phi", "khoa hoc"] },
  { category: ["luong"], words: ["luong", "salary", "payroll"] },
];
const contains = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

export function classifyFromHistory(note: string, kind: string, categories: CategoryChoice[], history: HistoryExample[]): CategorySuggestion {
  const text = normalizedDescription(note);
  if (text.length < 3) return { categoryId: null, confidence: 0, reason: "Thêm nội dung để nhận gợi ý.", source: "UNKNOWN" };
  const allowed = categories.filter(c => c.kind === kind);
  const matches = history.filter(h => h.kind === kind && h.note && h.categoryId && allowed.some(c => c.id === h.categoryId) && normalizedDescription(h.note) === text);
  if (matches.length) {
    const counts = new Map<string, number>();
    for (const h of matches) counts.set(h.categoryId!, (counts.get(h.categoryId!) ?? 0) + 1);
    const [id, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
    const ratio = count / matches.length;
    if (ratio >= 0.8) return { categoryId: id, confidence: matches.length >= 3 ? 0.97 : 0.85, reason: `Dựa trên ${count}/${matches.length} giao dịch có nội dung tương tự trong lịch sử.`, source: "HISTORY" };
    return { categoryId: null, confidence: 0, reason: "Lịch sử có nhiều danh mục khác nhau; cần chọn lại.", source: "UNKNOWN" };
  }
  for (const rule of keywords) {
    if (!rule.words.some(word => contains(text, word))) continue;
    const candidates = allowed.filter(c => rule.category.some(word => contains(normalizedDescription(c.name), word)));
    if (candidates.length === 1) return { categoryId: candidates[0].id, confidence: 0.8, reason: "Nội dung khớp từ khóa của danh mục.", source: "RULE" };
  }
  return { categoryId: null, confidence: 0, reason: "Chưa đủ lịch sử để xác định danh mục.", source: "UNKNOWN" };
}
