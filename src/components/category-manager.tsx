"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tags } from "lucide-react";

type Category = { id: string; parentId: string | null; name: string; kind: "INCOME" | "EXPENSE"; icon: string; color: string; archived: boolean };
const iconChoices = ["Circle", "Briefcase", "Gift", "Store", "TrendingUp", "Wallet", "Utensils", "Car", "House", "Receipt", "ShoppingBag", "Clapperboard", "GraduationCap", "HeartPulse", "Users", "Plane"];

export function categoryTreeRows(categories: Category[], kind: Category["kind"]) {
  const nodes = categories.filter(c => c.kind === kind);
  const ids = new Set(nodes.map(c => c.id));
  const seen = new Set<string>();
  const rows: { category: Category; depth: number }[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const category of nodes.filter(c => c.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, "vi"))) {
      if (seen.has(category.id)) continue;
      seen.add(category.id);
      rows.push({ category, depth });
      visit(category.id, depth + 1);
    }
  }
  visit(null, 0);
  // Legacy or malformed data remains visible instead of silently disappearing.
  for (const node of nodes) if (!seen.has(node.id) && (!node.parentId || !ids.has(node.parentId))) {
    seen.add(node.id); rows.push({ category: node, depth: 0 }); visit(node.id, 1);
  }
  return rows;
}

export function possibleCategoryParents(categories: Category[], kind: Category["kind"], editing: string | null) {
  const lookup = new Map(categories.map(c => [c.id, c]));
  return categories.filter(c => {
    if (c.kind !== kind || c.archived || c.id === editing) return false;
    const visited = new Set<string>();
    let parent: Category | undefined = c;
    while (parent) {
      if (parent.id === editing || visited.has(parent.id)) return false;
      visited.add(parent.id);
      parent = parent.parentId ? lookup.get(parent.parentId) : undefined;
    }
    return true;
  });
}

export function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#1E5EFF");
  const [icon, setIcon] = useState("Circle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function beginEdit(category: Category) {
    setEditing(category.id); setAdding(false); setName(category.name); setIcon(category.icon); setColor(category.color); setKind(category.kind); setParentId(category.parentId ?? ""); setError("");
  }
  function beginAdd() {
    setEditing(null); setAdding(true); setName(""); setIcon("Circle"); setColor("#1E5EFF"); setKind("EXPENSE"); setParentId(""); setError("");
  }
  async function request(url: string, method: "POST" | "PATCH", body: object) {
    const result = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await result.json();
    if (!result.ok) throw new Error(payload.error?.message || "Không thể lưu danh mục.");
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await request(editing ? `/api/v1/categories/${editing}` : "/api/v1/categories", editing ? "PATCH" : "POST", editing ? { name, color, icon, parentId: parentId || null } : { kind, name, color, icon, parentId: parentId || null });
      setEditing(null); setAdding(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi kết nối."); }
    finally { setBusy(false); }
  }
  async function toggle(category: Category) {
    setBusy(true); setError("");
    try {
      await request(`/api/v1/categories/${category.id}`, "PATCH", { archived: !category.archived });
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi kết nối."); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-head feature-page-head"><div><h1 className="page-title">Danh mục thu chi</h1><p className="subtitle">Tổ chức danh mục cha–con; lưu trữ không ảnh hưởng lịch sử giao dịch.</p></div><button className="button button-primary" onClick={beginAdd}><Plus /> Thêm danh mục</button></div>
    {(adding || editing) && <form className="card card-pad" style={{ marginBottom: 20 }} onSubmit={save}>
      <div className="section-header"><h2 className="section-title">{editing ? "Sửa danh mục" : "Thêm danh mục"}</h2><button type="button" className="button button-outline" onClick={() => { setEditing(null); setAdding(false); setError(""); }}>Đóng</button></div>
      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label htmlFor="category-name">Tên danh mục</label><input id="category-name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="category-kind">Loại giao dịch</label><select id="category-kind" disabled={!!editing} value={kind} onChange={e => { setKind(e.target.value as "INCOME" | "EXPENSE"); setParentId(""); }}><option value="EXPENSE">Chi tiêu</option><option value="INCOME">Thu nhập</option></select></div>
        <div className="field"><label htmlFor="category-parent">Danh mục cha</label><select id="category-parent" value={parentId} onChange={e => setParentId(e.target.value)}><option value="">Không có (cấp cao nhất)</option>{possibleCategoryParents(categories, kind, editing).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="category-icon">Biểu tượng</label><select id="category-icon" value={icon} onChange={e => setIcon(e.target.value)}>{[...new Set([...iconChoices, icon])].map(value => <option key={value}>{value}</option>)}</select></div>
        <div className="field"><label htmlFor="category-color">Màu nhận diện</label><input id="category-color" type="color" value={color} onChange={e => setColor(e.target.value)} /></div>
      </div>
      {error && <div role="alert" className="form-error">{error}</div>}
      <div className="form-footer"><button className="button button-primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu danh mục"}</button></div>
    </form>}
    {!adding && !editing && error && <div role="alert" className="form-error">{error}</div>}
    {(["EXPENSE", "INCOME"] as const).map(type => <section key={type} className="card card-pad module-record" style={{ marginBottom: 20 }}>
      <div className="section-header"><h2 className="section-title">{type === "EXPENSE" ? "Danh mục chi tiêu" : "Danh mục thu nhập"}</h2><span className="pill">{categories.filter(c => c.kind === type && !c.archived).length} đang sử dụng</span></div>
      {categories.filter(c => c.kind === type).length === 0 ? <div className="empty"><Tags /><strong>Chưa có danh mục</strong></div> : <div className="legend-list">
        {categoryTreeRows(categories, type).map(({ category, depth }) => <div key={category.id} className={`legend-row category-row ${category.archived ? "module-record-archived" : ""}`}>
          <span className="legend-label" style={{ paddingLeft: Math.min(depth, 3) * 12 }}><span aria-hidden="true">{depth > 0 ? "↳ " : ""}</span><span className="legend-dot" style={{ backgroundColor: category.color }} />{category.name}{category.archived && <span className="pill">Đã lưu trữ</span>}</span>
          <span className="category-row-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => beginEdit(category)}>Sửa</button><button type="button" className="button button-outline" disabled={busy} onClick={() => toggle(category)}>{category.archived ? "Khôi phục" : "Lưu trữ"}</button></span>
        </div>)}
      </div>}
    </section>)}
  </>;
}
