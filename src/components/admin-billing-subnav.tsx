import Link from "next/link";

type BillingSection = "operations" | "inbox" | "orders" | "payments" | "notices";

const sections: { key: BillingSection; label: string; href: string }[] = [
  { key: "operations", label: "Giám sát", href: "/admin/billing/operations" },
  { key: "inbox", label: "Hộp cảnh báo", href: "/admin/billing/operations/inbox" },
  { key: "orders", label: "Đơn thu phí", href: "/admin/billing/orders" },
  { key: "payments", label: "Đối soát", href: "/admin/billing/payments" },
  { key: "notices", label: "Thông báo", href: "/admin/billing/notices" },
];

/** Route navigation uses links and aria-current rather than interactive tabs. Parent pages enforce access. */
export function AdminBillingSubnav({ active }: { active: BillingSection }) {
  return <nav aria-label="Điều hướng vận hành thu phí" className="v4-admin-subnav">
    {sections.map(section => <Link key={section.key} href={section.href}
      aria-current={active === section.key ? "page" : undefined}>{section.label}</Link>)}
  </nav>;
}
