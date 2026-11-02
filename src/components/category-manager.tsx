"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowDownLeft, ArrowUpRight, Briefcase, Car, Circle, Clapperboard, CornerDownRight, Gift, GraduationCap, HeartPulse, House, Info, Pencil, Plane, Plus, Receipt, RotateCcw, Search, ShoppingBag, Store, Tags, TrendingUp, Users, Utensils, Wallet, X } from "lucide-react";
import { ActionMenu, ContentTabs } from "@/components/ui/interaction-controls";
import styles from "./finance-pages.module.css";

type Category = { id: string; parentId: string | null; name: string; kind: "INCOME" | "EXPENSE"; icon: string; color: string; archived: boolean };
const iconChoices = ["Circle", "Briefcase", "Gift", "Store", "TrendingUp", "Wallet", "Utensils", "Car", "House", "Receipt", "ShoppingBag", "Clapperboard", "GraduationCap", "HeartPulse", "Users", "Plane"];
const categoryIcons = { Circle, Briefcase, Gift, Store, TrendingUp, Wallet, Utensils, Car, House, Receipt, ShoppingBag, Clapperboard, GraduationCap, HeartPulse, Users, Plane };
const iconLabels: Record<string, string> = { Circle: "Cơ bản", Briefcase: "Công việc", Gift: "Quà tặng", Store: "Cửa hàng", TrendingUp: "Tăng trưởng", Wallet: "Ví", Utensils: "Ăn uống", Car: "Đi lại", House: "Nhà cửa", Receipt: "Hóa đơn", ShoppingBag: "Mua sắm", Clapperboard: "Giải trí", GraduationCap: "Giáo dục", HeartPulse: "Sức khỏe", Users: "Gia đình", Plane: "Du lịch" };
const searchKey = (value: string) => value.toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

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
  const [activeType, setActiveType] = useState<Category["kind"]>("EXPENSE");
  const [search, setSearch] = useState("");
  const [archivedView, setArchivedView] = useState(false);
  const active = categories.filter(c => !c.archived);
  const rows = categoryTreeRows(categories, activeType).filter(({ category }) => category.archived === archivedView && searchKey(`${category.name} ${categories.find(c => c.id === category.parentId)?.name ?? ""}`).includes(searchKey(search)));
  const PreviewIcon = categoryIcons[icon as keyof typeof categoryIcons] ?? Circle;
  useEffect(() => { if (adding || editing) document.getElementById("category-name")?.focus(); }, [adding, editing]);

  function beginEdit(category: Category) {
    setActiveType(category.kind);
    setEditing(category.id); setAdding(false); setName(category.name); setIcon(category.icon); setColor(category.color); setKind(category.kind); setParentId(category.parentId ?? ""); setError("");
  }
  function beginAdd() {
    setEditing(null); setAdding(true); setName(""); setIcon("Circle"); setColor("#1E5EFF"); setKind(activeType); setParentId(""); setError("");
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
      setActiveType(kind); if (adding) { setArchivedView(false); setSearch(""); } setEditing(null); setAdding(false); router.refresh();
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

  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>SẮP XẾP DÒNG TIỀN</span><h1>Danh mục thu chi</h1><p>Mỗi khoản tiền, đúng một nơi. Tổ chức thu chi theo cách của bạn.</p></div><button className="button button-primary" disabled={busy} onClick={beginAdd}><Plus size={17} /> Thêm danh mục</button></header>
    <section className={styles.stats} aria-label="Tổng quan danh mục"><div className={`${styles.stat} ${styles.accentStat}`}><div className={styles.statTop}><span>Danh mục chi tiêu</span><span className={styles.statIcon}><ArrowUpRight size={18} /></span></div><strong>{active.filter(c => c.kind === "EXPENSE").length}</strong><p>Phân loại những khoản chi</p></div><div className={styles.stat}><div className={styles.statTop}><span>Danh mục thu nhập</span><span className={`${styles.statIcon} ${styles.income}`}><ArrowDownLeft size={18} /></span></div><strong>{active.filter(c => c.kind === "INCOME").length}</strong><p>Theo dõi từng nguồn thu</p></div><div className={styles.stat}><div className={styles.statTop}><span>Đã lưu trữ</span><span className={`${styles.statIcon} ${styles.muted}`}><Archive size={18} /></span></div><strong>{categories.length - active.length}</strong><p>Lịch sử giao dịch vẫn được giữ</p></div></section>
    {(adding || editing) && <form className={styles.editor} onSubmit={save} aria-label={editing ? "Sửa danh mục" : "Thêm danh mục"}>
      <div className={styles.editorHead}><h2>{editing ? "Sửa danh mục" : "Thêm danh mục"}</h2><button type="button" className={styles.closeButton} disabled={busy} aria-label="Đóng biểu mẫu danh mục" onClick={() => { setEditing(null); setAdding(false); setError(""); }}><X size={19} /></button></div><fieldset disabled={busy}>
      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label htmlFor="category-name">Tên danh mục</label><input id="category-name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="category-kind">Loại giao dịch</label><select id="category-kind" disabled={!!editing} value={kind} onChange={e => { setKind(e.target.value as "INCOME" | "EXPENSE"); setParentId(""); }}><option value="EXPENSE">Chi tiêu</option><option value="INCOME">Thu nhập</option></select></div>
        <div className="field"><label htmlFor="category-parent">Danh mục cha</label><select id="category-parent" value={parentId} onChange={e => setParentId(e.target.value)}><option value="">Không có (cấp cao nhất)</option>{possibleCategoryParents(categories, kind, editing).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="category-icon">Biểu tượng</label><select id="category-icon" value={icon} onChange={e => setIcon(e.target.value)}>{[...new Set([...iconChoices, icon])].map(value => <option value={value} key={value}>{iconLabels[value] ?? value}</option>)}</select></div>
        <div className="field"><label htmlFor="category-color">Màu nhận diện</label><input id="category-color" type="color" value={color} onChange={e => setColor(e.target.value)} /></div>
        <div className={styles.colorPreview}><span className={styles.categoryGlyph} style={{ background: `color-mix(in srgb, ${color} 12%, var(--finova-surface))` }}><PreviewIcon size={20} /></span><div><strong>{name || "Tên danh mục của bạn"}</strong><small>Xem trước màu và biểu tượng</small></div></div>
      </div></fieldset>
      {error && <div role="alert" className="form-error">{error}</div>}
      <div className="form-footer"><button className="button button-primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu danh mục"}</button></div>
    </form>}
    {!adding && !editing && error && <div role="alert" className="form-error">{error}</div>}
    <section className={styles.panel}><div className={styles.panelHead}><div><h2>Danh mục của bạn</h2><p>Nhóm các danh mục con dưới cùng một danh mục cha.</p></div><Tags size={20} className={styles.muted} /></div>
    <ContentTabs idBase="category-kind" label="Nhóm danh mục" value={activeType} onChange={setActiveType} className={styles.tabs} options={[
      { value: "EXPENSE", label: "Chi tiêu" }, { value: "INCOME", label: "Thu nhập" },
    ]} />
    <div className={styles.toolbar}><div className={styles.search}><Search size={17} /><input aria-label="Tìm danh mục" placeholder="Tìm danh mục…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className={styles.filters} role="group" aria-label="Trạng thái danh mục"><button type="button" aria-pressed={!archivedView} onClick={() => setArchivedView(false)}>Đang dùng</button><button type="button" aria-pressed={archivedView} onClick={() => setArchivedView(true)}>Đã lưu trữ</button></div></div>
    <section role="tabpanel" id={`category-kind-panel-${activeType}`} aria-labelledby={`category-kind-tab-${activeType}`} tabIndex={0} className={styles.tabPanel}>
      {!rows.length ? <div className={styles.empty}><span className={styles.emptyIcon}><Tags size={29} /></span><h3>{search ? "Không tìm thấy danh mục" : archivedView ? "Chưa có danh mục lưu trữ" : "Bắt đầu sắp xếp thu chi"}</h3><p>{search ? "Thử tên danh mục hoặc tên danh mục cha khác." : archivedView ? "Các danh mục bạn lưu trữ sẽ xuất hiện tại đây." : "Thêm danh mục đầu tiên để phân loại giao dịch rõ ràng hơn."}</p>{!search && !archivedView && <button type="button" className="button button-primary" onClick={beginAdd}><Plus size={16} />Thêm danh mục</button>}</div> : rows.map(({ category, depth }) => {
        const Icon = categoryIcons[category.icon as keyof typeof categoryIcons] ?? Circle;
        const parent = categories.find(c => c.id === category.parentId);
        const children = categories.filter(c => c.parentId === category.id && !c.archived).length;
        return <article key={category.id} className={styles.categoryRow}><div className={styles.categoryIdentity} style={{ paddingLeft: Math.min(depth, 3) * 14 }}>{depth > 0 && <CornerDownRight size={15} className={styles.categoryBranch} />}<span className={styles.categoryGlyph} style={{ background: `color-mix(in srgb, ${category.color} 12%, var(--finova-surface))` }}><Icon size={19} /></span><div><h3>{category.name}</h3><p>{parent ? `Thuộc ${parent.name}` : children ? `${children} danh mục con đang dùng` : "Danh mục cấp cao nhất"}</p></div></div><span className={styles.categoryType}>{category.archived ? "Đã lưu trữ" : depth > 0 ? "Danh mục con" : "Danh mục chính"}</span><ActionMenu label={`Thao tác danh mục ${category.name}`} disabled={busy} items={[
            { label: "Sửa danh mục", icon: Pencil, onSelect: () => beginEdit(category) },
            { label: category.archived ? "Khôi phục" : "Lưu trữ", icon: category.archived ? RotateCcw : Archive, danger: !category.archived, onSelect: () => toggle(category) },
          ]} /></article>;
      })}
    </section></section><p className={styles.footnote}><Info size={14} />Lưu trữ danh mục không làm thay đổi lịch sử giao dịch. Bạn có thể khôi phục bất cứ lúc nào.</p>
  </div>;
}
