"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";

export type DraftCriterion = { name: string; description: string; weight: number };

/**
 * The rubric editor.
 *
 * WEIGHTS ARE IN WHOLE PERCENT HERE AND BASIS POINTS ON CHAIN. The contract
 * refuses anything that does not sum to exactly 10000 bps — it does not
 * normalise for you, because a contract that silently rescaled a treasurer's
 * weights would publish a rubric nobody wrote. So this editor does the
 * balancing in the UI, visibly, and shows the running total until it is
 * exactly 100.
 *
 * Changing one weight takes the difference off the OTHERS, proportionally,
 * which is the behaviour that lets somebody set the one number they care about
 * and leave the rest alone.
 */
export function CriteriaEditor({
  criteria,
  onChange,
  min,
  max,
}: {
  criteria: DraftCriterion[];
  onChange: (next: DraftCriterion[]) => void;
  min: number;
  max: number;
}) {
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);

  function setWeight(index: number, next: number) {
    const clamped = Math.max(1, Math.min(99, Math.round(next)));
    const others = criteria.filter((_, i) => i !== index);
    const remaining = 100 - clamped;
    const otherTotal = others.reduce((s, c) => s + c.weight, 0) || 1;

    const rebalanced = criteria.map((c, i) => {
      if (i === index) return { ...c, weight: clamped };
      return { ...c, weight: Math.max(1, Math.round((c.weight / otherTotal) * remaining)) };
    });

    // Rounding will not land on 100 exactly; the drift goes onto the largest
    // OTHER criterion so that the one the user is dragging stays where they put
    // it.
    const drift = 100 - rebalanced.reduce((s, c) => s + c.weight, 0);
    if (drift !== 0) {
      let target = -1;
      rebalanced.forEach((c, i) => {
        if (i === index) return;
        if (target < 0 || c.weight > rebalanced[target].weight) target = i;
      });
      if (target >= 0) {
        rebalanced[target] = {
          ...rebalanced[target],
          weight: Math.max(1, rebalanced[target].weight + drift),
        };
      }
    }
    onChange(rebalanced);
  }

  function addCriterion() {
    if (criteria.length >= max) return;
    const next = [...criteria, { name: "", description: "", weight: 0 }];
    const even = Math.floor(100 / next.length);
    const balanced = next.map((c, i) => ({
      ...c,
      weight: i === 0 ? 100 - even * (next.length - 1) : even,
    }));
    onChange(balanced);
  }

  function removeCriterion(index: number) {
    if (criteria.length <= min) return;
    const next = criteria.filter((_, i) => i !== index);
    const even = Math.floor(100 / next.length);
    onChange(
      next.map((c, i) => ({ ...c, weight: i === 0 ? 100 - even * (next.length - 1) : even })),
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gap: 14 }}>
        {criteria.map((c, i) => (
          <div
            key={i}
            className="card"
            style={{ padding: 16, background: "rgba(0,0,0,0.18)" }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <GripVertical size={15} color="var(--muted)" style={{ flexShrink: 0 }} />
              <input
                className="input"
                value={c.name}
                maxLength={60}
                onChange={(e) => {
                  const next = [...criteria];
                  next[i] = { ...c, name: e.target.value };
                  onChange(next);
                }}
                placeholder={`Criterion ${i + 1} — e.g. Technical feasibility`}
              />
              <button
                className="btn btn-ghost"
                onClick={() => removeCriterion(i)}
                disabled={criteria.length <= min}
                title={criteria.length <= min ? `A round needs at least ${min} criteria` : "Remove"}
                style={{ padding: "8px 10px", flexShrink: 0 }}
                aria-label="Remove criterion"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <textarea
              className="textarea"
              rows={2}
              maxLength={400}
              value={c.description}
              onChange={(e) => {
                const next = [...criteria];
                next[i] = { ...c, description: e.target.value };
                onChange(next);
              }}
              placeholder="What a good answer to this criterion looks like. The words here are also what a proposal is matched against, so name the subject plainly."
            />

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <input
                type="range"
                min={1}
                max={99}
                value={c.weight}
                onChange={(e) => setWeight(i, Number(e.target.value))}
                style={{ flex: 1, accentColor: "var(--gold)" }}
                aria-label={`Weight for ${c.name || `criterion ${i + 1}`}`}
              />
              <span
                style={{
                  width: 54,
                  textAlign: "right",
                  color: "var(--gold)",
                  fontSize: "0.92rem",
                  flexShrink: 0,
                }}
              >
                {c.weight}%
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <button
          className="btn btn-ghost"
          onClick={addCriterion}
          disabled={criteria.length >= max}
          title={criteria.length >= max ? `A round takes at most ${max} criteria` : undefined}
        >
          <Plus size={15} /> Add a criterion
        </button>
        <span
          style={{
            fontSize: "0.86rem",
            color: total === 100 ? "var(--emerald)" : "var(--rose)",
          }}
        >
          weights total {total}% — must be exactly 100%
        </span>
      </div>
    </div>
  );
}
