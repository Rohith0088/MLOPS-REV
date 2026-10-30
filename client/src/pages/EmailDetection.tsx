import { AlertTriangle, CheckCircle2, MailCheck, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { SectionHeader } from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { EvidenceList, RecommendationPanel, RiskScoreCard, VerdictBanner } from "@/components/AnalysisResult";

const examples = [
  {
    label: "Infosys offer",
    sender: "careers@infosys.com",
    subject: "Your Infosys job offer",
    content: "Congratulations, you have been selected. Please confirm your joining date through the official careers portal.",
  },
  {
    label: "Impersonation",
    sender: "infosys-careers@gmail.com",
    subject: "Urgent: Infosys offer letter",
    content: "Pay the processing fee immediately and send your Aadhaar, password, and verification code to release your offer.",
  },
];

export default function EmailDetection() {
  const [sender, setSender] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [headers, setHeaders] = useState("");
  const analysis = trpc.emailDetection.analyze.useMutation();
  const history = trpc.emailDetection.history.useQuery();
  const utils = trpc.useUtils();

  const runAnalysis = () => analysis.mutate({ sender, subject, content, replyTo: replyTo || undefined, headers: headers || undefined }, { onSuccess: () => void utils.emailDetection.history.invalidate() });
  const applyExample = (example: (typeof examples)[number]) => {
    setSender(example.sender);
    setSubject(example.subject);
    setContent(example.content);
    analysis.reset();
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <SectionHeader
        eyebrow="EMAIL INTELLIGENCE"
        title="Verify a suspicious email"
        description="Check the sender pattern and message content before trusting an offer or request."
        action={<div className="flex items-center gap-2 text-[11px] text-slate-400"><ShieldCheck size={14} className="text-emerald-400" /> Live DNS and content checks</div>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="panel p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20"><MailCheck size={19} /></span>
            <div>
              <h3 className="text-sm font-semibold text-white">Email risk scanner</h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">We perform live MX, SPF, and DMARC DNS checks, inspect message signals, and scan embedded links without opening them.</p>
            </div>
          </div>

          <label className="field-label text-slate-400" htmlFor="sender-input">Sender email address</label>
          <input id="sender-input" value={sender} onChange={event => setSender(event.target.value)} placeholder="recruiter@company.com" className="field-input h-11" type="email" autoComplete="off" />

          <label className="field-label mt-4 text-slate-400" htmlFor="reply-to-input">Reply-To address <span className="text-slate-600">(optional)</span></label>
          <input id="reply-to-input" value={replyTo} onChange={event => setReplyTo(event.target.value)} placeholder="reply@company.com" className="field-input h-11" type="email" autoComplete="off" />

          <label className="field-label mt-4 text-slate-400" htmlFor="subject-input">Email subject</label>
          <input id="subject-input" value={subject} onChange={event => setSubject(event.target.value)} placeholder="Your job offer" className="field-input h-11" />

          <label className="field-label mt-4 text-slate-400" htmlFor="content-input">Email content</label>
          <textarea id="content-input" value={content} onChange={event => setContent(event.target.value)} placeholder="Paste the email text here..." className="field-input min-h-36 resize-y py-3 leading-5" />

          <label className="field-label mt-4 text-slate-400" htmlFor="headers-input">Authentication headers <span className="text-slate-600">(optional)</span></label>
          <textarea id="headers-input" value={headers} onChange={event => setHeaders(event.target.value)} placeholder="Paste trusted message headers if available..." className="field-input min-h-20 resize-y py-3 leading-5" />

          <button onClick={runAnalysis} disabled={!sender.trim() || analysis.isPending} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
            <Search size={15} />
            {analysis.isPending ? "Reviewing email..." : "Check email risk"}
          </button>

          {analysis.error && <p role="alert" className="mt-2 text-[11px] text-rose-300">{analysis.error.message}</p>}

          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Try a demo case</div>
            <div className="flex flex-wrap gap-2">
              {examples.map(example => <button key={example.label} onClick={() => applyExample(example)} className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] text-slate-400 transition hover:border-blue-400/40 hover:text-slate-200">{example.label}</button>)}
            </div>
          </div>
        </div>

        <div className="panel min-h-[460px] p-5 sm:p-6">
          {!analysis.data ? <EmptyResult /> : <EmailResult result={analysis.data} />}
        </div>
      </div>
      <div className="panel mt-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Recent email scans</h3><p className="mt-1 text-[11px] text-slate-500">Saved results for your signed-in account.</p></div><span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{history.data?.length ?? 0} records</span></div>
        {history.isLoading ? <p className="text-xs text-slate-500">Loading scan history...</p> : history.error ? <p role="alert" className="text-xs text-rose-300">{history.error.message}</p> : history.data?.length ? <div className="space-y-2">{history.data.map(scan => <div key={scan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs"><div className="min-w-0"><div className="truncate font-mono text-slate-300">{scan.sender}</div><div className="text-[10px] text-slate-500">{new Date(scan.createdAt).toLocaleString()}</div></div><div className="flex items-center gap-3"><span className="text-slate-400">Score {scan.riskScore}</span><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-slate-300">{scan.verdict.replaceAll("_", " ")}</span></div></div>)}</div> : <p className="text-xs text-slate-500">No saved email scans yet.</p>}
      </div>
    </div>
  );
}

function EmptyResult() {
  return <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center"><div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-white/[0.04] text-slate-500 ring-1 ring-white/10"><MailCheck size={25} /></div><h3 className="text-sm font-semibold text-white">Waiting for an email</h3><p className="mt-2 max-w-[280px] text-[11px] leading-5 text-slate-500">Paste the sender address and message content to see the domain match, risk tag, and reasons.</p></div>;
}

function EmailResult({ result }: { result: { sender: string; senderDomain: string; organization: string | null; risk: "LOW" | "REVIEW" | "HIGH"; verdict: "PHISHING" | "LIKELY_FRAUD" | "SUSPICIOUS" | "LEGITIMATE" | "INCONCLUSIVE"; riskScore: number; confidence: number | null; signals: Array<{ label: string; detail: string; tone: "positive" | "warning" | "danger" }>; missingEvidence: string[]; recommendation: string; disclaimer: string } }) {
  const tone = result.risk === "HIGH" ? "danger" : result.risk === "LOW" ? "positive" : "warning";
  return <div>
    <div className="mb-4"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sender analyzed</div><div className="mt-1 break-all font-mono text-xs text-slate-300">{result.sender}</div></div>
    <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">What this result means</div><VerdictBanner verdict={result.verdict} title={result.risk === "HIGH" ? "Treat this message as high risk" : result.risk === "LOW" ? "No strong fraud signals detected" : "Review this message before acting"} description={result.recommendation} tone={tone} />
    <div className="mt-4"><RiskScoreCard score={result.riskScore} /></div>
    <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] text-slate-400"><span className="text-slate-500">Sender domain:</span> <span className="font-mono text-slate-200">{result.senderDomain}</span>{result.organization && <><span className="mx-2 text-slate-600">·</span><span className="text-slate-500">Directory match:</span> <span className="text-slate-200">{result.organization}</span></>}</div>
    <EvidenceList items={result.signals} title="Why the system reached this result" />
    {result.missingEvidence.length > 0 && <EvidenceList items={result.missingEvidence.map(item => ({ label: "Evidence unavailable", detail: item, tone: "warning" as const }))} title="Uncertainty and missing evidence" />}
    <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recommended action</div><RecommendationPanel>{result.recommendation}</RecommendationPanel>
    <div className="mt-4 border-t border-white/10 pt-4 text-[10px] leading-4 text-slate-500">{result.disclaimer}</div>
  </div>;
}
