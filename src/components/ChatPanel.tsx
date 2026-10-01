import { isReadOnly } from "@/lib/runtime/mode";
import { agentMessageAction } from "@/app/actions";
import type { AgentCode, AgentMessage } from "@/lib/db/records";
import Link from "next/link";
import { ago } from "./ui";

export function ChatPanel({ agent, name, messages, suggestions }: { agent: AgentCode; name: string; messages: AgentMessage[]; suggestions: string[] }) {
  const shown = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-30);
  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[480px] min-h-48 overflow-y-auto rounded-xl border border-edge bg-[#060a1c] p-3" aria-live="polite">
        {shown.length === 0 && <p className="text-muted">No messages yet. Ask {name} something, or give an instruction. Replies come from real Northline state.</p>}
        {shown.map((m) => (
          <div key={m.id} className={`mb-3 flex ${m.role === "operator" ? "justify-end" : ""}`}>
            <div className={`max-w-[90%] whitespace-pre-wrap rounded-xl border px-3 py-2 text-[13px] ${m.role === "operator" ? "border-blue/40 bg-blue/15" : "border-edge bg-panel2"}`}>
              {m.content}
              {(m.taskIds.length > 0 || m.reportIds.length > 0) && <div className="mt-1.5 text-[11px] text-muted">{m.taskIds.length > 0 && <>{m.taskIds.length} task(s) · </>}{m.reportIds.length > 0 && <Link className="text-blue2" href="/agents/reports">report in inbox →</Link>}</div>}
              <div className="mt-1 text-[10px] text-faint">{m.role === "operator" ? "You" : name} · {ago(m.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => <form key={s} action={agentMessageAction}><input type="hidden" name="agent" value={agent} /><input type="hidden" name="text" value={s} /><button disabled={isReadOnly()} className="rounded-full border border-edge px-2.5 py-1 text-[12px] text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">{s}</button></form>)}
      </div>
      <form action={agentMessageAction} className="flex gap-2">
        <input type="hidden" name="agent" value={agent} />
        <input name="text" required maxLength={2000} autoComplete="off" placeholder={`Message ${name}…`} aria-label={`Message ${name}`} />
        <button disabled={isReadOnly()} title={isReadOnly() ? "Read-only mode: changes are disabled" : undefined} className="rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-4 font-bold disabled:cursor-not-allowed disabled:opacity-40">Send</button>
      </form>
    </div>
  );
}
