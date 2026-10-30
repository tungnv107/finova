"use client";
import { useEffect, useRef, useState } from "react";
import type { CategorySuggestion as Suggestion } from "@/lib/ai-classification";
import styles from "./financial-ai.module.css";
export function CategorySuggestion({ note, kind, categories, onSelect, disabled = false }: { note: string; kind: string; categories: { id: string; name: string }[]; onSelect: (id: string) => void; disabled?: boolean }) {
  const [result, setResult] = useState<{ key: string; data: Suggestion } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const sequence = useRef(0), key = `${kind}:${note}`;
  useEffect(() => {
    const current = ++sequence.current;
    if (kind === "TRANSFER" || note.trim().length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/v1/ai/classify", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, note }) });
        const body = await r.json(); if (r.ok && current === sequence.current) setResult({ key, data: body.data });
      } catch { /* Optional local suggestion; explicit AI errors are shown below. */ }
    }, 800);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [note, kind, key]);
  if (kind === "TRANSFER" || note.trim().length < 3) return null;
  const suggestion = result?.key === key ? result.data : null;
  async function askAi() {
    const current = ++sequence.current; setBusy(true); setError("");
    try {
      const r = await fetch("/api/v1/ai/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, note, useAi: true }) });
      const body = await r.json(); if (!r.ok) throw new Error(body.error?.message || "Không nhận được gợi ý.");
      if (current === sequence.current) setResult({ key, data: body.data });
    } catch (e) { if (current === sequence.current) setError(e instanceof Error ? e.message : "Lỗi kết nối."); } finally { setBusy(false); }
  }
  return <div className={styles.suggestion}>
    {suggestion?.categoryId ? <><span>Gợi ý: <strong>{categories.find(c => c.id === suggestion.categoryId)?.name}</strong> · {Math.round(suggestion.confidence * 100)}% · {suggestion.reason}</span><button type="button" className="button button-outline" disabled={disabled || busy} onClick={() => onSelect(suggestion.categoryId!)}>Dùng danh mục này</button></> : <span>{suggestion?.reason || "Đang tìm trong lịch sử…"}</span>}
    <button type="button" className="button button-outline" disabled={disabled || busy} onClick={askAi}>{busy ? "Đang gợi ý…" : "Gợi ý bằng AI"}</button><small>Bấm để gửi nội dung đã che chuỗi số dài/email và mẫu lịch sử tới OpenAI.</small>
    {error && <span role="alert" className="form-error">{error}</span>}
  </div>;
}
