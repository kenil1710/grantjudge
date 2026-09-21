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

  /**
   * The most one criterion may take: everything except a floor of 1% for each
   * of the others.
   *
   * Without this the slider went to 99 with four criteria, the three others
   * could not go below 1 each, and the total landed on 102 — a state the
   * validation correctly refused and the user could only escape by dragging
   * back. A slider that can reach an invalid value is a slider with a trap on
   * the end of it.
   */
  const ceiling = Math.max(1, 100 - (criteria.length - 1));

  function setWeight(index: number, next: number) {
    const clamped = Math.max(1, Math.min(ceiling, Math.round(next)));
    const remaining = 100 - clamped;
    const otherTotal =
      criteria.reduce((sum, c, i) => (i === index ? sum : sum + c.weight), 0) || 1;

    const weights = criteria.map((c, i) =>
      i === index ? clamped : Math.max(1, Math.round((c.weight / otherTotal) * remaining)),
    );

    /**
     * Spread the rounding drift, one point at a time, over the criteria that
     * can absorb it.
     *
     * The first version dumped the whole drift on the single largest other
     * criterion, and a fuzz over seven thousand drags found seven states where
     * that could not absorb it — every other criterion was already pinned at
     * the 1% floor — and the editor came to rest on 101%. The contract refuses
     * anything that is not exactly 10000 basis points, so that is not a
     * cosmetic wrong total; it is a dead end the user can only escape by
     * dragging back.
     *
     * One point at a time, skipping anything at its floor, always terminates:
     * either a point moves or no criterion can take one, and the loop stops.
     */
    let drift = 100 - weights.reduce((sum, w) => sum + w, 0);
    let guard = 400;
    while (drift !== 0 && guard-- > 0) {
      let moved = false;
      for (let i = 0; i < weights.length && drift !== 0; i++) {
        if (i === index) continue;
        if (drift > 0) {
          weights[i] += 1;
          drift -= 1;
          moved = true;
        } else if (weights[i] > 1) {
          weights[i] -= 1;
          drift += 1;
          moved = true;
        }
      }
      if (!moved) break;
    }

    onChange(criteria.map((c, i) => ({ ...c, weight: weights[i] })));
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
                max={ceiling}
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
