import { useLocation } from "wouter";
import { Activity, Bell, Boxes, CreditCard, Database, FlaskConical, LayoutDashboard, Link2, MailCheck, Menu, Network, ScrollText, Settings, ShieldCheck, Workflow, X, Zap } from "lucide-react";
import { useState } from "react";

const navGroups = [
  { label: "OPERATIONS", items: [
    { label: "Overview", path: "/", icon: LayoutDashboard },
    { label: "Transactions", path: "/transactions", icon: CreditCard },
    { label: "Link detection", path: "/link-detection", icon: Link2 },
    { label: "Email verification", path: "/email-detection", icon: MailCheck },
    { label: "Pipeline", path: "/pipeline", icon: Workflow },
  ] },
  { label: "MLOPS", items: [
    { label: "Monitoring", path: "/monitoring", icon: Activity },
    { label: "Models", path: "/models", icon: Boxes },
    { label: "Experiments", path: "/experiments", icon: FlaskConical },
  ] },
  { label: "CONTROL", items: [
    { label: "Alerts", path: "/alerts", icon: Bell, badge: "3" },
    { label: "Audit logs", path: "/audit", icon: ScrollText },
    { label: "Settings", path: "/settings", icon: Settings },
  ] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeLabel = navGroups.flatMap((group) => group.items).find((item) => item.path === location)?.label ?? "Overview";
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-100">
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col bg-[#0b1018] text-slate-300 shadow-2xl transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[72px] items-center justify-between border-b border-white/10 px-5">
          <button onClick={() => setLocation("/")} className="flex items-center gap-3 text-left">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white shadow-lg shadow-blue-500/10 ring-1 ring-white/10"><ShieldCheck size={20} strokeWidth={2.2} /></span>
            <span><span className="block text-[15px] font-semibold tracking-tight text-white">Fraud Sentinel</span><span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Risk Operations</span></span>
          </button>
          <button className="rounded p-1 text-slate-400 hover:bg-white/10 lg:hidden" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          {navGroups.map((group) => <div key={group.label} className="mb-6"><div className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-slate-500">{group.label}</div><div className="space-y-1">{group.items.map((item) => { const active = item.path === location; return <button key={item.path} onClick={() => { setLocation(item.path); setMobileOpen(false); }} className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors ${active ? "bg-white/[0.05] text-white ring-1 ring-white/10" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"}`}><item.icon size={17} className={active ? "text-blue-300" : "text-slate-500 group-hover:text-slate-300"} /><span className="flex-1 text-left">{item.label}</span>{item.badge && <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">{item.badge}</span>}</button>; })}</div></div>)}
        </div>
        <div className="border-t border-white/10 p-3">
          <div className="mb-3 rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/5"><div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-slate-300"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]" /> All systems operational</div><div className="flex items-center justify-between text-[10px] text-slate-500"><span>Current model</span><span className="font-mono text-slate-300">v1.2.0</span></div></div>
          <div className="flex items-center gap-3 rounded-md px-2 py-2 text-slate-400"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-700 text-slate-200">A</span><span className="flex-1"><span className="block text-xs font-medium text-slate-200">Anonymous access</span><span className="block text-[10px] text-slate-500">Login not required</span></span></div>
        </div>
      </aside>
      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-white/10 bg-[#070b11]/80 px-5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3"><button className="rounded-md p-2 text-slate-500 hover:bg-white/5 lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div><div className="text-[11px] font-medium text-slate-400">Risk Operations / <span className="text-slate-200">{activeLabel}</span></div><h1 className="mt-0.5 text-[18px] font-semibold tracking-tight text-white">{activeLabel}</h1></div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-4 text-[11px] text-slate-500 md:flex"><span className="flex items-center gap-1.5"><Network size={13} className="text-emerald-500" /> API connected</span><span className="flex items-center gap-1.5"><Database size={13} className="text-emerald-500" /> Database connected</span><span className="flex items-center gap-1.5"><CpuIcon /> Model loaded</span></div><div className="h-7 w-px bg-slate-700" /><button className="relative rounded-md p-2 text-slate-300 hover:bg-white/5" onClick={() => setLocation("/alerts")}><Bell size={18} /><span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" /></button><div className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-xs font-semibold text-slate-100 ring-1 ring-white/10">MC</div></div>
        </header>
        <main className="min-h-[calc(100vh-72px)] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function CpuIcon() { return <Zap size={13} className="text-emerald-500" />; }

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) { return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">{eyebrow}</div>}<h2 className="text-[22px] font-semibold tracking-tight text-white">{title}</h2>{description && <p className="mt-1 text-[13px] text-slate-400">{description}</p>}</div>{action}</div>; }

export function StatusDot({ tone = "green" }: { tone?: "green" | "amber" | "red" }) { return <span className={`inline-block h-2 w-2 rounded-full ${tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-rose-500"}`} />; }
