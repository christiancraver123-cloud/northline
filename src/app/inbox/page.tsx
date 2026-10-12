import { Card, PageHeader, Pill } from "@/components/ui";
import { instagramStatus } from "@/lib/flags";

const VIEWS = ["All", "Unread", "AI drafted", "Brand leads", "Needs approval"] as const;

/** Placeholder until Instagram is reconnected. No DM infrastructure exists and no Meta calls are made. */
export default function Inbox() {
  const ig = instagramStatus();
  return (
    <>
      <PageHeader title="Inbox" sub="Creator DMs in one place — once Instagram is connected." />
      <div role="status" className="mb-5 rounded-2xl border border-bad/40 bg-bad/10 p-4">
        <div className="font-mono text-[13px] font-bold text-bad">{ig.label}</div>
        <p className="mt-1 text-[13.5px]">{ig.detail}</p>
        <p className="mt-2 text-[12.5px] text-muted">When the account is back, DMs will arrive through Meta&apos;s official messaging webhooks only — no browser automation, no unofficial logins. Replies about brands, money, contracts or anything sensitive will always wait for you.</p>
      </div>
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Views">{VIEWS.map((v) => <span key={v} className="rounded-full border border-edge px-3 py-1 text-[12.5px] text-faint">{v} · 0</span>)}</div>
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card><h2 className="mb-2 font-bold">Accounts</h2>{["Sienna", "Alessia", "Mila", "Vesper", "Zoe", "Skye"].map((n) => <div key={n} className="flex items-center justify-between border-t border-edge py-1.5 text-[13px] first:border-0">{n}<Pill tone="mute">disconnected</Pill></div>)}</Card>
        <Card><h2 className="mb-2 font-bold">Conversations</h2><p className="text-[13px] text-muted">No conversations. Nothing is being received.</p></Card>
        <Card><h2 className="mb-2 font-bold">Conversation</h2><p className="text-[13px] text-muted">Select a conversation to see the thread, the AI draft and the approval controls.</p></Card>
      </div>
    </>
  );
}
