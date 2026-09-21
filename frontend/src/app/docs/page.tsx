"use client";

import Link from "next/link";
import {
  BookOpen,
  Boxes,
  Coins,
  Droplets,
  Gavel,
  HelpCircle,
  Scale,
  ShieldAlert,
  Sigma,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useConfig } from "@/lib/hooks";
import { CANONICAL_ADDRESS, CONSUMER_ADDRESS, CONTRACT_ADDRESS } from "@/lib/genlayer";
import { describeWindow, formatGen, scoreText } from "@/lib/format";

const SECTIONS = [
  { id: "start", label: "Getting started", Icon: Droplets },
  { id: "scoring", label: "How scoring works", Icon: Scale },
  { id: "contest", label: "The appeal", Icon: ShieldAlert },
  { id: "settlement", label: "Settlement maths", Icon: Sigma },
  { id: "integrate", label: "Integration guide", Icon: Boxes },
  { id: "faq", label: "FAQ", Icon: HelpCircle },
];

export default function DocsPage() {
  const { data: config } = useConfig();

  return (
    <AppShell
      wide
      eyebrow="Documentation"
      title="How GrantJudge works"
      blurb="The whole system in one page: what a treasurer sets, what a proposer writes, what the validators decide, and what is left to arithmetic."
    >
      <div style={{ display: "grid", gap: 26, gridTemplateColumns: "minmax(0,1fr)" }} className="docs-grid">
        <nav
          style={{
            position: "sticky",
            top: 82,
            alignSelf: "start",
            display: "none",
            flexDirection: "column",
            gap: 2,
          }}
          className="docs-nav"
        >
          {SECTIONS.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 11px",
                borderRadius: 9,
                color: "var(--cream-dim)",
                textDecoration: "none",
                fontSize: "0.85rem",
              }}
            >
              <Icon size={15} strokeWidth={1.9} />
              {label}
            </a>
          ))}
        </nav>

        <div style={{ display: "grid", gap: 22, minWidth: 0 }}>
          <Section id="start" title="Getting started" Icon={Droplets}>
            <P>
              GrantJudge is deployed on <strong>GenLayer Studio Devnet</strong>,
              chain 61997. Nothing here is a real grant and the GEN is not real
              money — but every transaction, every consensus round and every
              transfer is genuine.
            </P>
            <Steps
              items={[
                {
                  title: "Get a wallet on the right network",
                  body: "Any injected EIP-1193 wallet works. Connecting from this app adds and switches to Studio Devnet for you.",
                },
                {
                  title: "Get some GEN",
                  body: `Studio Devnet is faucet-funded. Ask the Studio faucet for the address you are going to use; the amounts on this app are small — a proposal deposit is ${config ? formatGen(config.spam_stake_wei) : "0.10"} GEN and an appeal stakes ${config ? formatGen(config.contest_stake_wei) : "0.20"} GEN.`,
                },
                {
                  title: "Read a round before you write for it",
                  body: "Open any round and read the rubric. The weights are fixed for good when the round is created — there is no setter for them anywhere in the contract.",
                },
                {
                  title: "Preview your draft",
                  body: "The propose page runs your draft through the deployed contract before you stake anything, and shows the exact range each criterion may be scored in.",
                },
              ]}
            />
            <Addresses />
          </Section>

          <Section id="scoring" title="How scoring works" Icon={Scale}>
            <P>
              Every score in this contract is an <strong>integer bucket from 0
              to 7</strong>, and every total derived from them is an integer
              hundredth of a bucket from 0 to 700 — displayed as{" "}
              <code>4.25 / 7.00</code>. There is not one floating-point number
              anywhere in the contract.
            </P>
            <H3>What GenLayer does, and what it does not</H3>
            <P>
              GenLayer does exactly one thing: it reads a proposal written in
              English against criteria written in English and says how well the
              first answers the second. That is a judgement. It has no closed
              form, no API and no oracle, and a committee doing it is the status
              quo this replaces.
            </P>
            <P>
              Deterministic code does everything else — the brackets that bound
              what a score may be, the coverage count, the weighted total, the
              ranking, the proportional split, the threshold test, the appeal
              arithmetic, the remainder and every transfer.{" "}
              <strong>Not one wei is moved by a model.</strong> A model that
              answered nonsense could, at worst, decline to fund something; it
              could never pay anybody.
            </P>

            <H3>Brackets: the score is bounded before a model is asked</H3>
            <P>
              Before any model call, the contract measures the proposal against
              a published vocabulary — figures, dates and milestones, budget
              language, track record, named beneficiaries, stated risks — and
              against how much of each criterion&rsquo;s own words the proposal
              actually touches. Those two numbers produce a{" "}
              <strong>bracket</strong> per criterion: a low and a high, never
              more than four buckets wide. The model chooses inside the bracket
              and nowhere else.
            </P>
            <Callout>
              A criterion your proposal never addresses <strong>cannot be scored
              above 2 out of 7</strong> — not by a validator, not by the leader
              of a consensus round, and not by any model. That is enforced by
              arithmetic before an inference is paid for.
            </Callout>

            <H3>The vector, and what the validators compare</H3>
            <P>
              Each node returns a vector: one bucket per criterion, an overall
              quality bucket, and a completeness count that is fully
              deterministic. Validators compare <strong>every dimension</strong>{" "}
              — with a tolerance of exactly one bucket, because two honest
              readers of the same proposal may genuinely differ by one — and
              compare the <strong>qualification flag exactly</strong>. So a
              leader may shade a criterion by a bucket. A leader may not move a
              proposal across the funding bar. When two readings fall on
              opposite sides of it, nothing is written and anybody may run the
              evaluation again.
            </P>
            <Formula>
              weighted total ={" "}
              <b>
                80% × Σ(criterion score × its weight) + 10% × quality + 10% ×
                completeness
              </b>
              , all in integer hundredths
            </Formula>
            <P>
              Every stored field is re-derived from the agreed vector after
              consensus returns, re-hashed, and published. The{" "}
              <em>Verify this score from storage</em> button on any scored
              proposal re-runs the whole derivation on chain from the proposal
              text, the rubric and the vector — with no model and no input from
              you — and reports each field beside what was stored.
            </P>
          </Section>

          <Section id="contest" title="The appeal" Icon={ShieldAlert}>
            <P>
              A rejected proposer may appeal once, inside the round&rsquo;s
              appeal window, by staking{" "}
              <strong>{config ? formatGen(config.contest_stake_wei) : "0.20"} GEN</strong>{" "}
              and adding new evidence of up to{" "}
              {config?.max_evidence_chars ?? 2000} characters.
            </P>
            <P>
              The proposal is read again against the same rubric with the new
              text appended. That changes the signals, which changes the
              brackets, which raises the ceiling the scorers may reach. It is
              worth being precise about what this means:{" "}
              <strong>new evidence buys room, not a score.</strong> An appeal
              made of adjectives earns a lower bracket than the original filing,
              because filler is subtracted.
            </P>
            <Callout>
              <strong>Nothing is ever clawed back.</strong> An award already made
              is somebody&rsquo;s money. A successful appeal is paid strictly out
              of what the ranking did not allocate — and if that is not enough
              for the full share, the appeal is partially funded and the
              shortfall is named rather than swallowed.
            </Callout>
            <P>
              If the appeal succeeds, the appeal stake and the original deposit
              both come back. If it fails, the appeal stake goes to the
              round&rsquo;s pool — which is to say to the treasurer, who paid for
              a second reading they did not ask for. It never goes to this
              contract. If the network cannot produce a reading at all, the stake
              is returned in full and the appeal can be filed again.
            </P>
          </Section>

          <Section id="settlement" title="Settlement maths" Icon={Sigma}>
            <P>The rule, in the order it applies:</P>
            <ol style={{ margin: "0 0 18px", paddingLeft: 20, lineHeight: 1.9, color: "var(--cream-dim)", fontSize: "0.9rem" }}>
              <li>Rank by score, ties to the earlier filing.</li>
              <li>
                Everything at or above the bar <strong>qualifies</strong>. A
                qualifying proposal gets its deposit back whether or not it wins
                a seat.
              </li>
              <li>The top N qualifiers <strong>win</strong>.</li>
              <li>
                A winner&rsquo;s share is the pool in proportion to its score
                among the winners, <strong>capped at what it asked for</strong>.
              </li>
              <li>Everything not awarded is the remainder.</li>
            </ol>
            <Formula>sum(awards) + remainder = pool, exactly, always</Formula>
            <P>
              Integer division floors every share, so the dust falls into the
              remainder rather than into a rounding error nobody owns. Asking for
              less than your share does not enrich the other winners — it
              enlarges the remainder, which is the treasurer&rsquo;s.
            </P>
            <H3>Where the money can be</H3>
            <P>
              The contract publishes its own books on every read:{" "}
              <code>balance = locked + payable</code>. Everything it holds is
              either locked in a live round or already somebody&rsquo;s to claim.
              There is no third bucket and no protocol revenue: a forfeited
              deposit goes to the pool, which the treasurer reclaims, and the
              contract owner has no withdraw method at all — not a gated one,
              none.
            </P>
            <H3>What the owner can and cannot do</H3>
            <P>
              The owner can pause <em>new rounds and new proposals</em>. That is
              the whole of it. Evaluation, finalisation, appeals, stall
              settlement and every claim keep working while paused — an owner who
              could strand a pool could extort a treasurer, which is worse than
              forging a score because it needs no validators at all.
            </P>
            <H3>Stuck proposals</H3>
            <P>
              If the network cannot score a proposal for{" "}
              {config ? describeWindow(config.stall_ttl_s) : "48 hours"} after the
              deadline, anyone may settle it as <strong>skipped</strong>. The
              deposit comes back in full — failing to be scored is not the same
              as scoring badly and must not cost the same — and the round can
              then be finalised. That call works while paused, by design and by
              test.
            </P>
          </Section>

          <Section id="integrate" title="Integration guide for DAOs" Icon={Boxes}>
            <P>
              There are two ways to read this contract and only one of them is
              safe to act on.
            </P>
            <Code>{`# "What do you know?" — degrades to a reason string.
get_award(round_id, proposal_id) -> {found, funded, award_wei, score, ...}
is_funded(round_id, proposal_id) -> bool

# "May I act on this?" — against your own floor and staleness limit.
check_funded(round_id, proposal_id, min_score, max_age_seconds)
  -> {ok: bool, reason: str, award_wei, score, tier, ...}`}</Code>
            <P>
              The first is right for a UI, a dashboard or a dry run. The second
              is right for anything that puts capital or reputation at risk,
              because it takes <em>your</em> policy — your score floor, your
              staleness limit — rather than the judge&rsquo;s.
            </P>
            <H3>The reverting form, and why it lives in the consumer</H3>
            <P>
              GrantJudge contains <strong>zero raise statements</strong>. It
              holds money, and a revert in a method that received value strands
              that value with no record to refund it from. So every refusal comes
              back as <code>{"{status: \"REJECTED\", reason}"}</code> with the
              value credited to a pull ledger.
            </P>
            <P>
              <code>GrantConsumer</code> — the example integration — holds
              nothing. It has zero payable methods and no transfer call anywhere
              in it, so it can afford to refuse in the one way an integrator
              cannot accidentally ignore: <code>register_grant</code> reverts on
              a grant the judge will not vouch for. Copy that contract, not a
              custom integration that holds funds.
            </P>
            <Code>{`@gl.contract.interface
class IGrantJudge:
    class View:
        def check_funded(self, round_id, proposal_id,
                         min_score, max_age_seconds): ...

answer = IGrantJudge(JUDGE).view().check_funded(r, p, 400, 90 * 86400)
if not answer.get("ok"):
    raise gl.vm.UserError("not a grant we recognise: " + answer["reason"])`}</Code>
          </Section>

          <Section id="faq" title="FAQ" Icon={HelpCircle}>
            <Faq q="Can the treasurer change the criteria after proposals are in?">
              No. The rubric, the weights, the bar, the seats, the deadline and
              both stakes are written once when the round is created and there is
              no setter for any of them. The rubric hash is printed on the round
              page so anybody can check it has not moved.
            </Faq>
            <Faq q="Can the treasurer take the pool back after reading the proposals?">
              No. A round can be cancelled only while <em>no</em> proposal has
              been filed. After that, the only thing a treasurer can take is what
              the ranking did not allocate, and only once the appeal window has
              closed.
            </Faq>
            <Faq q="What happens to my deposit?">
              It comes back in full if you score at or above the bar — whether or
              not you win a seat — and in full if the network fails to score you.
              It is forfeited only if you are scored and found below the bar, and
              then it goes to the round&rsquo;s pool.
            </Faq>
            <Faq q="Can I write my proposal to game the scorer?">
              You can write it to score well, and the contract tells you how: put
              figures in, cost it out, name who benefits, say what could go
              wrong, and cut the adjectives. Trying to instruct the scorer
              directly is counted as a signal against you and lowers your
              ceiling, because an injection attempt is, mechanically, filler.
            </Faq>
            <Faq q="What if the validators disagree?">
              Nothing is written and the transaction changes no state. Anybody
              may call <code>evaluate</code> again. That is the correct direction
              to fail in — a treasury that awards a grant nobody scored is worse
              than one that is briefly unable to score.
            </Faq>
            <Faq q="Why are there two deployed instances?">
              They are the same source. The canonical one enforces the brief — a
              24-hour appeal window, a 48-hour stall window, one round per wallet
              per hour — which is correct and completely un-watchable. The demo
              instance has the same rules with the windows in minutes, so a whole
              round can be seen end to end. This app reads the demo instance.
            </Faq>
            <Faq q="Is the money real?">
              No. Studio Devnet GEN is test currency. Note also that Studio Dev
              queues a value transfer posted on finalisation and does not execute
              it, which is a property of that network and not of this contract —
              so <code>get_stats</code> publishes the contract&rsquo;s real chain
              balance beside its own books and names the gap{" "}
              <code>undelivered_wei</code> rather than hiding it.
            </Faq>
          </Section>

          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <BookOpen size={22} color="var(--gold)" />
            <h3 style={{ margin: "12px 0 8px", fontSize: "1.15rem" }}>Ready to try it?</h3>
            <p style={{ margin: "0 auto 18px", maxWidth: 420, color: "var(--cream-dim)", fontSize: "0.88rem", lineHeight: 1.65 }}>
              Open a round with your own criteria, or find one that is taking
              proposals and write against it.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/create" className="btn btn-primary"><Coins size={16} /> Create a round</Link>
              <Link href="/rounds" className="btn btn-ghost"><Gavel size={16} /> Browse rounds</Link>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 960px) {
          .docs-grid { grid-template-columns: 214px minmax(0,1fr) !important; }
          .docs-nav { display: flex !important; }
        }
      `}</style>
    </AppShell>
  );
}

function Section({
  id,
  title,
  Icon,
  children,
}: {
  id: string;
  title: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card" style={{ padding: "clamp(20px, 3.4vw, 30px)", scrollMarginTop: 86 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Icon size={20} color="var(--gold)" strokeWidth={1.8} />
        <h2 style={{ margin: 0, fontSize: "clamp(1.3rem, 3vw, 1.7rem)" }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 14px", fontSize: "0.92rem", lineHeight: 1.75, color: "var(--cream-dim)" }}>
      {children}
    </p>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ margin: "24px 0 10px", fontSize: "1.05rem", color: "var(--cream)" }}>{children}</h3>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: "16px 0",
        padding: "14px 16px",
        borderRadius: 11,
        background: "rgba(212,168,71,0.06)",
        border: "1px solid rgba(212,168,71,0.24)",
        fontSize: "0.88rem",
        lineHeight: 1.7,
        color: "var(--cream-dim)",
      }}
    >
      {children}
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: "16px 0",
        padding: "14px 16px",
        borderRadius: 11,
        background: "rgba(0,0,0,0.28)",
        border: "1px solid var(--line-soft)",
        fontSize: "0.86rem",
        lineHeight: 1.7,
        color: "var(--gold)",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre
      className="mono"
      style={{
        margin: "14px 0",
        padding: "14px 16px",
        borderRadius: 11,
        background: "rgba(0,0,0,0.35)",
        border: "1px solid var(--line-soft)",
        overflowX: "auto",
        fontSize: "0.78rem",
        lineHeight: 1.7,
        color: "var(--cream-dim)",
      }}
    >
      {children}
    </pre>
  );
}

function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol style={{ margin: "0 0 16px", padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
      {items.map((item, i) => (
        <li key={item.title} style={{ display: "flex", gap: 12 }}>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              fontSize: "0.75rem",
              color: "var(--gold)",
              background: "rgba(212,168,71,0.1)",
              border: "1px solid rgba(212,168,71,0.25)",
            }}
          >
            {i + 1}
          </span>
          <div>
            <strong style={{ fontSize: "0.9rem", color: "var(--cream)" }}>{item.title}</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.86rem", lineHeight: 1.65, color: "var(--cream-dim)" }}>
              {item.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid var(--line-soft)" }}>
      <strong style={{ display: "block", marginBottom: 7, fontSize: "0.94rem", color: "var(--cream)" }}>{q}</strong>
      <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.72, color: "var(--cream-dim)" }}>{children}</p>
    </div>
  );
}

function Addresses() {
  const rows: [string, string | null][] = [
    ["GrantJudge (demo — this app)", CONTRACT_ADDRESS],
    ["GrantJudge (canonical)", CANONICAL_ADDRESS],
    ["GrantConsumer (custody: false)", CONSUMER_ADDRESS],
  ];
  return (
    <div
      style={{
        marginTop: 18,
        padding: "14px 16px",
        borderRadius: 11,
        background: "rgba(0,0,0,0.24)",
        border: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--gold)", fontSize: "0.74rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        <Wallet size={13} /> Deployed on Studio Devnet · chain 61997
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map(([label, address]) =>
          address ? (
            <div key={label} style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", fontSize: "0.8rem" }}>
              <span style={{ color: "var(--cream-dim)" }}>{label}</span>
              <span className="mono" style={{ color: "var(--muted)", wordBreak: "break-all" }}>{address}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
