"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hash, LibraryBig, Lock, Rocket, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CriteriaEditor, type DraftCriterion } from "@/components/CriteriaEditor";
import { EmptyState, ErrorState, SkeletonGrid } from "@/components/States";
import { TxButton } from "@/components/TxButton";
import { useTemplates } from "@/lib/hooks";
import { createRoundFromTemplate, createTemplate } from "@/lib/contract";
import { formatTime, parseGen, shortAddress } from "@/lib/format";
import type { Template } from "@/types";

const STARTER: DraftCriterion[] = [
  { name: "Technical feasibility", description: "Can this be built as described?", weight: 40 },
  { name: "Impact", description: "Who benefits, and how directly?", weight: 35 },
  { name: "Budget reasonableness", description: "Is the cost costed out and proportionate?", weight: 25 },
];

export default function TemplatesPage() {
  const { data, error, isLoading, mutate } = useTemplates();
  const [name, setName] = useState("");
  const [criteria, setCriteria] = useState<DraftCriterion[]>(STARTER);
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  const criteriaJson = useMemo(
    () =>
      JSON.stringify(
        criteria.map((c) => ({ name: c.name.trim(), description: c.description.trim(), weight_bps: c.weight * 100 })),
      ),
    [criteria],
  );
  const invalid = name.trim().length < 3 || total !== 100 || criteria.some((c) => !c.name.trim());

  return (
    <AppShell
      wide
      eyebrow="Templates"
      title="Criteria templates"
      blurb="Named rubrics anyone may open a pool with. A template is immutable the moment it is saved — a pool opened from it has the rubric the template had, for ever, hash for hash."
    >
      {isLoading && <SkeletonGrid count={2} />}
      {error && <ErrorState onRetry={() => mutate()} message={(error as Error).message} />}
      {!isLoading && !error && (data?.templates.length ?? 0) === 0 && (
        <EmptyState
          icon={<LibraryBig size={26} strokeWidth={1.6} />}
          title="No templates saved yet"
          message="Save the first one below, or save any pool's rubric from its page."
        />
      )}
      <div style={{ display: "grid", gap: 16, marginBottom: 30 }}>
        {(data?.templates ?? []).map((t) => (
          <TemplateCard key={t.template_id} template={t} />
        ))}
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h2 className="serif" style={{ margin: "0 0 6px", fontSize: "1.3rem" }}>
          <Save size={18} style={{ verticalAlign: -3 }} /> Save a new template
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: "0.86rem", color: "var(--muted)", lineHeight: 1.6 }}>
          Validated exactly as a round&apos;s rubric is: three to five criteria, weights summing to exactly 100%.
          Free to save, public to use, and there is no method that edits it afterwards.
        </p>
        <input
          className="input"
          placeholder="Template name, e.g. Standard Ecosystem"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <CriteriaEditor criteria={criteria} onChange={setCriteria} min={3} max={5} />
        <div style={{ marginTop: 16 }}>
          <TxButton
            label="Save the template"
            icon={<LibraryBig size={16} />}
            disabled={invalid}
            send={(acc) => createTemplate(acc, name.trim(), criteriaJson)}
            onDone={(r) => {
              if (r.status === "OK") {
                setName("");
                void mutate();
              }
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}

function TemplateCard({ template }: { template: Template }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${template.name} pool`);
  const [pool, setPool] = useState("2");
  const [seats, setSeats] = useState(2);
  const [days, setDays] = useState(7);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span className="mono" style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
            template #{template.template_id} · by {shortAddress(template.creator)} · {formatTime(template.created_at)}
          </span>
          <h3 className="serif" style={{ margin: "6px 0 10px", fontSize: "1.15rem" }}>
            <Lock size={14} style={{ verticalAlign: -1, color: "var(--muted)" }} /> {template.name}
          </h3>
        </div>
        <button className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>
          <Rocket size={15} /> Open a pool from this
        </button>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {template.criteria.map((c) => (
          <div key={c.position} style={{ fontSize: "0.84rem", color: "var(--cream-dim)" }}>
            <strong style={{ color: "var(--cream)" }}>{c.name}</strong>{" "}
            <span style={{ color: "var(--gold)" }}>({c.weight_pct})</span>
            {c.description ? ` — ${c.description}` : ""}
          </div>
        ))}
      </div>
      <div className="mono" style={{ marginTop: 10, fontSize: "0.69rem", color: "var(--muted)" }}>
        <Hash size={11} style={{ verticalAlign: -1 }} /> {template.criteria_hash}
      </div>
      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line-soft)", display: "grid", gap: 12 }}>
          <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="Pool name" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <label style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Pool (GEN)
              <input className="input" inputMode="decimal" value={pool} onChange={(e) => setPool(e.target.value.replace(/[^\d.]/g, ""))} />
            </label>
            <label style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Seats
              <input className="input" type="number" min={1} max={8} value={seats} onChange={(e) => setSeats(Number(e.target.value) || 1)} />
            </label>
            <label style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Open for (days)
              <input className="input" type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} />
            </label>
          </div>
          <TxButton
            label={`Open the pool · deposit ${pool || "0"} GEN`}
            icon={<Rocket size={16} />}
            disabled={name.trim().length < 3 || parseGen(pool) <= 0n}
            send={(acc) =>
              createRoundFromTemplate(acc, {
                poolId: 0,
                templateId: template.template_id,
                name: name.trim(),
                description: `A pool opened from the ${template.name} template.`,
                maxProposals: Math.max(seats, 8),
                maxWinners: seats,
                minScoreThreshold: 400,
                deadlineSeconds: days * 86400,
                poolWei: parseGen(pool),
                options: {},
              })
            }
            onDone={(r) => {
              if (r.status === "OK" && r.pool_id) router.push(`/pool/${r.pool_id}`);
            }}
          />
          {(template.pools?.length ?? 0) > 0 && (
            <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
              Already used by {template.pools?.map((p) => <Link key={p} href={`/pool/${p}`}>#{p} </Link>)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
