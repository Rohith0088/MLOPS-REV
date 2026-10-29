import dns from "node:dns/promises";
import { getDomainRecord } from "./reputation-data";
import { analyzeLink, type LinkAnalysis } from "./link-detector";

export type EmailRisk = "LOW" | "REVIEW" | "HIGH";
export type EmailVerdict = "PHISHING" | "LIKELY_FRAUD" | "SUSPICIOUS" | "LEGITIMATE" | "INCONCLUSIVE";

type EmailSignal = {
  label: string;
  detail: string;
  tone: "positive" | "warning" | "danger";
};

export type EmailAnalysis = {
  sender: string;
  senderDomain: string;
  organization: string | null;
  risk: EmailRisk;
  verdict: EmailVerdict;
  riskScore: number;
  confidence: number | null;
  signals: EmailSignal[];
  recommendation: string;
  links: LinkAnalysis[];
  missingEvidence: string[];
  domainChecks: {
    mx: "PASS" | "FAIL" | "INCONCLUSIVE";
    spf: "PASS" | "FAIL" | "INCONCLUSIVE";
    dmarc: "PASS" | "FAIL" | "INCONCLUSIVE";
  };
  disclaimer: string;
};

const freeMailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "proton.me",
  "protonmail.com",
]);
const urgencyPattern = /urgent|immediately|act now|within \d+ hours|last chance|final warning/i;
const moneyPattern = /fee|payment|processing charge|registration charge|gift card|wire transfer|bank details|pay now/i;
const credentialPattern = /password|otp|one[- ]time password|verification code|login|reset|credential|social security|aadhaar|pan card/i;
const hiringPattern = /hired|job offer|selected|joining|interview|recruit|salary|employment|offer letter/i;
const shortenerPattern = /(?:https?:\/\/)?(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rb\.gy)\b/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const dnsTimeoutMs = 2500;

function addSignal(signals: EmailSignal[], label: string, detail: string, tone: EmailSignal["tone"]) {
  signals.push({ label, detail, tone });
}

async function withDnsTimeout<T>(operation: Promise<T>): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DNS lookup timeout")), dnsTimeoutMs)),
  ]);
}

async function checkEmailDomain(domain: string) {
  const checks = {
    mx: "INCONCLUSIVE" as "PASS" | "FAIL" | "INCONCLUSIVE",
    spf: "INCONCLUSIVE" as "PASS" | "FAIL" | "INCONCLUSIVE",
    dmarc: "INCONCLUSIVE" as "PASS" | "FAIL" | "INCONCLUSIVE",
  };
  try {
    checks.mx = (await withDnsTimeout(dns.resolveMx(domain))).length ? "PASS" : "FAIL";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    checks.mx = code === "ENODATA" || code === "ENOTFOUND" ? "FAIL" : "INCONCLUSIVE";
  }
  try {
    const records = await withDnsTimeout(dns.resolveTxt(domain));
    checks.spf = records.some(record => record.join("").toLowerCase().startsWith("v=spf1")) ? "PASS" : "FAIL";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    checks.spf = code === "ENODATA" || code === "ENOTFOUND" ? "FAIL" : "INCONCLUSIVE";
  }
  try {
    const records = await withDnsTimeout(dns.resolveTxt(`_dmarc.${domain}`));
    checks.dmarc = records.some(record => record.join("").toLowerCase().startsWith("v=dmarc1")) ? "PASS" : "FAIL";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    checks.dmarc = code === "ENODATA" || code === "ENOTFOUND" ? "FAIL" : "INCONCLUSIVE";
  }
  return checks;
}

function addDomainCheckSignals(signals: EmailSignal[], checks: Awaited<ReturnType<typeof checkEmailDomain>>) {
  const checksToReport = [
    ["MX record", checks.mx, "A receiving mail server is published for this domain.", "No receiving mail server was found for this domain."],
    ["SPF policy", checks.spf, "The domain publishes an SPF policy.", "The domain does not publish an SPF policy."],
    ["DMARC policy", checks.dmarc, "The domain publishes a DMARC policy.", "The domain does not publish a DMARC policy."],
  ] as const;
  for (const [label, status, passDetail, failDetail] of checksToReport) {
    if (status === "PASS") addSignal(signals, `Live ${label} check`, passDetail, "positive");
    else if (status === "FAIL") addSignal(signals, `Live ${label} check`, failDetail, label === "MX record" ? "danger" : "warning");
    else addSignal(signals, `Live ${label} check`, "The DNS provider did not return a definitive result within the safety timeout.", "warning");
  }
}

export async function analyzeEmail(senderInput: string, subject: string, content: string, options?: { replyTo?: string; headers?: string; attachments?: string[] }): Promise<EmailAnalysis> {
  const sender = senderInput.trim().toLowerCase();
  const normalizedSubject = subject.trim();
  const normalizedContent = content.trim();
  const signals: EmailSignal[] = [];
  const combined = `${normalizedSubject} ${normalizedContent}`;

  if (!emailPattern.test(sender)) {
    return {
      sender,
      senderDomain: "Invalid address",
      organization: null,
      risk: "HIGH",
      verdict: "INCONCLUSIVE",
      riskScore: 100,
      confidence: null,
      signals: [{ label: "Invalid sender address", detail: "The sender is not a complete email address.", tone: "danger" }],
      recommendation: "Do not reply or open attachments. Confirm the sender through an official website.",
      links: [],
      missingEvidence: ["A valid sender address is required for domain assessment."],
      domainChecks: { mx: "INCONCLUSIVE", spf: "INCONCLUSIVE", dmarc: "INCONCLUSIVE" },
      disclaimer: "This is a pattern-based demonstration and does not contact the sender or verify mailbox ownership.",
    };
  }

  const senderDomain = sender.split("@")[1].toLowerCase();
  const domainRecord = getDomainRecord(senderDomain);
  const organizationEntry = domainRecord?.organization ? [domainRecord.organization, [senderDomain]] as const : undefined;
  const senderAlias = sender.split("@")[0];
  const mentionedOrganization = ["Infosys", "Google", "Microsoft", "Amazon", "Apple", "Accenture"].find(name => new RegExp(`\\b${name}\\b`, "i").test(`${senderAlias} ${combined}`));
  let riskScore = 0;
  const domainChecks = await checkEmailDomain(senderDomain);
  addDomainCheckSignals(signals, domainChecks);
  if (domainChecks.mx === "FAIL") riskScore += 25;
  if (domainChecks.spf === "FAIL") riskScore += 8;
  if (domainChecks.dmarc === "FAIL") riskScore += 8;

  if (organizationEntry) {
    addSignal(signals, "Organization domain matched", `${organizationEntry[0]} uses ${senderDomain} in this demo directory.`, "positive");
  } else if (freeMailDomains.has(senderDomain)) {
    riskScore += 35;
    addSignal(signals, "Free-mail sender", `${senderDomain} is not an official company domain and can be used to impersonate recruiters.`, "warning");
  } else {
    riskScore += 18;
    addSignal(signals, "Unrecognized organization domain", `The domain ${senderDomain} is not in the current verification directory.`, "warning");
  }

  if (mentionedOrganization && (!organizationEntry || organizationEntry[0] !== mentionedOrganization)) {
    riskScore += 35;
    addSignal(signals, "Organization mismatch", `The message mentions ${mentionedOrganization}, but the sender domain does not match its known pattern.`, "danger");
  }

  if (urgencyPattern.test(combined)) {
    riskScore += 18;
    addSignal(signals, "Urgent language", "The message pressures the recipient to act quickly or avoid review.", "warning");
  }

  if (moneyPattern.test(combined)) {
    riskScore += 25;
    addSignal(signals, "Money request", "The message asks for a fee, payment, transfer, or gift card.", "danger");
  }

  if (credentialPattern.test(combined)) {
    riskScore += 25;
    addSignal(signals, "Credential request", "The message references passwords, codes, identity documents, or account access.", "danger");
  }

  if (shortenerPattern.test(normalizedContent)) {
    riskScore += 15;
    addSignal(signals, "Shortened link", "A shortened link hides the destination and should be opened only after independent verification.", "warning");
  }

  if (hiringPattern.test(combined) && !organizationEntry) {
    riskScore += 12;
    addSignal(signals, "Recruitment claim from unknown domain", "The message discusses hiring but does not come from a recognized organization domain.", "warning");
  }

  const urls = Array.from(new Set(combined.match(/https?:\/\/[^\s<>"']+/gi) ?? [])).slice(0, 10);
  const links = await Promise.all(urls.map(url => analyzeLink(url)));
  const suspiciousLinks = links.filter(link => link.verdict === "MALICIOUS" || link.verdict === "SUSPICIOUS" || link.verdict === "UNREACHABLE" || link.verdict === "INCONCLUSIVE");
  if (suspiciousLinks.length) {
    riskScore += Math.min(40, suspiciousLinks.reduce((total, link) => total + (link.verdict === "MALICIOUS" ? 25 : 12), 0));
    addSignal(signals, "Suspicious message link", `${suspiciousLinks.length} embedded link(s) require independent verification before opening.`, "danger");
  }
  if (options?.replyTo && options.replyTo.trim().toLowerCase() !== sender) {
    riskScore += 25;
    addSignal(signals, "Reply-To mismatch", "Replies would be directed to an address different from the displayed sender.", "danger");
  }
  if (options?.headers) {
    const normalizedHeaders = options.headers.toLowerCase();
    const authFailures = ["spf=fail", "dkim=fail", "dmarc=fail", "dmarc=none"].filter(value => normalizedHeaders.includes(value));
    const authPasses = ["spf=pass", "dkim=pass", "dmarc=pass"].filter(value => normalizedHeaders.includes(value));
    if (authFailures.length) {
      riskScore += Math.min(35, authFailures.length * 12);
      addSignal(signals, "Authentication header failure", `${authFailures.join(", ")} was found in the supplied headers.`, "danger");
    } else if (authPasses.length) {
      addSignal(signals, "Authentication header result", `${authPasses.join(", ")} was found in the supplied headers; verify the headers came from the receiving mail system.`, "positive");
    }
  }
  if (options?.attachments?.length) {
    const riskyAttachment = options.attachments.some(name => /\.(exe|scr|js|vbs|bat|cmd|ps1|iso|zip)$/i.test(name));
    if (riskyAttachment) {
      riskScore += 30;
      addSignal(signals, "Risky attachment type", "One or more attachments can execute code or conceal executable content.", "danger");
    } else {
      addSignal(signals, "Attachment metadata supplied", "Attachment names were supplied, but files were not opened or executed.", "warning");
    }
  }

  if (signals.length === 1 && riskScore === 0) {
    addSignal(signals, "No obvious content red flags", "The sender pattern and message did not trigger the current heuristic checks.", "positive");
  }

  riskScore = Math.min(100, riskScore);
  const risk: EmailRisk = riskScore >= 60 ? "HIGH" : riskScore >= 30 ? "REVIEW" : "LOW";
  const verdict: EmailVerdict = riskScore >= 75
    ? "PHISHING"
    : riskScore >= 60
      ? "LIKELY_FRAUD"
      : riskScore >= 30
        ? "SUSPICIOUS"
        : links.length || organizationEntry
          ? "LEGITIMATE"
          : "INCONCLUSIVE";
  const confidence = null;
  const missingEvidence = [
    !options?.headers ? "Authentication headers were not provided; SPF, DKIM, and DMARC results were not verified." : null,
    !options?.replyTo ? "Reply-To metadata was not provided." : null,
    !options?.attachments ? "Attachment metadata was not provided." : null,
  ].filter((item): item is string => Boolean(item));
  const recommendation = risk === "LOW"
    ? "Still verify important offers through the organization's official careers page before sharing personal information."
    : risk === "REVIEW"
      ? "Do not click links or send documents yet. Contact the organization using a trusted channel."
      : "Treat this as likely fraud. Do not reply, pay fees, share codes, or open attachments.";

  return {
    sender,
    senderDomain,
    organization: organizationEntry?.[0] ?? mentionedOrganization ?? null,
    risk,
    verdict,
    riskScore,
    confidence,
    signals,
    recommendation,
    links,
    missingEvidence,
    domainChecks,
    disclaimer: "This is a live DNS and content assessment. It does not verify mailbox ownership, prove that a sender controlled the message, or replace checks performed by the receiving mail provider.",
  };
}
