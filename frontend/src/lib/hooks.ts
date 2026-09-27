"use client";

/**
 * SWR wrappers around the contract reads.
 *
 * Every hook here returns `{ data, error, isLoading, mutate }` and every screen
 * branches on all three — a page that renders only the happy path is a page
 * that shows an empty table when Studio is having a bad minute.
 *
 * `refreshInterval` is used sparingly and only where the chain genuinely moves
 * without the user doing anything: a round being evaluated, and the global
 * stats banner. Polling everything would spend a user's rate limit on data
 * nobody is looking at.
 */
import useSWR from "swr";
import {
  getApprovals,
  getMilestoneStatus,
  getPool,
  getPoolHistory,
  getPools,
  getProposerStats,
  getRemainderRoute,
  getRoundAnalytics,
  getTemplate,
  getTemplates,
  getConfig,
  getOpenRounds,
  getProposal,
  getProposals,
  getProposalsByAuthor,
  getRankings,
  getRound,
  getRounds,
  getRoundsByTreasurer,
  getStats,
  payoutOf,
  previewProposal,
  verifyEvaluation,
} from "./contract";

const STABLE = { revalidateOnFocus: false, shouldRetryOnError: false } as const;

export const useStats = () =>
  useSWR("stats", getStats, { ...STABLE, refreshInterval: 30_000 });

export const useConfig = () => useSWR("config", getConfig, STABLE);

export const useOpenRounds = () =>
  useSWR("open-rounds", getOpenRounds, { ...STABLE, refreshInterval: 20_000 });

export const useAllRounds = () =>
  useSWR("all-rounds", () => getRounds(0, 60), { ...STABLE, refreshInterval: 20_000 });

export const useRound = (roundId: number | null, live = false) =>
  useSWR(
    roundId ? ["round", roundId] : null,
    () => getRound(roundId as number),
    { ...STABLE, refreshInterval: live ? 20_000 : 0 },
  );

export const useProposals = (roundId: number | null, live = false) =>
  useSWR(
    roundId ? ["proposals", roundId] : null,
    () => getProposals(roundId as number),
    { ...STABLE, refreshInterval: live ? 20_000 : 0 },
  );

export const useRankings = (roundId: number | null, live = false) =>
  useSWR(
    roundId ? ["rankings", roundId] : null,
    () => getRankings(roundId as number),
    { ...STABLE, refreshInterval: live ? 20_000 : 0 },
  );

export const useProposal = (roundId: number | null, proposalId: number | null) =>
  useSWR(
    roundId && proposalId ? ["proposal", roundId, proposalId] : null,
    () => getProposal(roundId as number, proposalId as number),
    STABLE,
  );

export const useMyProposals = (address: string | null) =>
  useSWR(
    address ? ["by-author", address.toLowerCase()] : null,
    () => getProposalsByAuthor(address as string),
    { ...STABLE, refreshInterval: 20_000 },
  );

export const useMyRounds = (address: string | null) =>
  useSWR(
    address ? ["by-treasurer", address.toLowerCase()] : null,
    () => getRoundsByTreasurer(address as string),
    STABLE,
  );

export const usePayout = (address: string | null) =>
  useSWR(
    address ? ["payout", address.toLowerCase()] : null,
    () => payoutOf(address as string),
    { ...STABLE, refreshInterval: 25_000 },
  );

export const useVerification = (
  roundId: number | null,
  proposalId: number | null,
  enabled: boolean,
) =>
  useSWR(
    enabled && roundId && proposalId ? ["verify", roundId, proposalId] : null,
    () => verifyEvaluation(roundId as number, proposalId as number),
    STABLE,
  );

/**
 * The live bracket preview for a draft.
 *
 * Debounced by the caller, not here: this is a chain read on every keystroke
 * otherwise, and Studio meters requests per minute.
 */
export const usePreview = (
  roundId: number | null,
  description: string,
  timeline: string,
  team: string,
  enabled: boolean,
) =>
  useSWR(
    enabled && roundId && description.length > 0
      ? ["preview", roundId, description, timeline, team]
      : null,
    () => previewProposal(roundId as number, description, timeline, team),
    { ...STABLE, keepPreviousData: true },
  );

/* --- the milestone build ------------------------------------------------ */

export const usePools = () => useSWR("pools", () => getPools(0, 60), { ...STABLE, refreshInterval: 30_000 });

export const usePool = (poolId: number | null) =>
  useSWR(poolId ? ["pool", poolId] : null, () => getPool(poolId as number), STABLE);

export const usePoolHistory = (poolId: number | null) =>
  useSWR(
    poolId ? ["pool-history", poolId] : null,
    () => getPoolHistory(poolId as number),
    { ...STABLE, refreshInterval: 30_000 },
  );

export const useApprovals = (roundId: number | null, enabled: boolean) =>
  useSWR(
    enabled && roundId ? ["approvals", roundId] : null,
    () => getApprovals(roundId as number),
    { ...STABLE, refreshInterval: 20_000 },
  );

export const useMilestoneStatus = (roundId: number | null, proposalId: number | null, enabled: boolean) =>
  useSWR(
    enabled && roundId && proposalId ? ["milestones", roundId, proposalId] : null,
    () => getMilestoneStatus(roundId as number, proposalId as number),
    STABLE,
  );

export const useProposerStats = (address: string | null) =>
  useSWR(
    address ? ["proposer", address.toLowerCase()] : null,
    () => getProposerStats(address as string),
    STABLE,
  );

export const useTemplates = () => useSWR("templates", getTemplates, STABLE);

export const useTemplate = (templateId: number | null) =>
  useSWR(templateId ? ["template", templateId] : null, () => getTemplate(templateId as number), STABLE);

export const useAnalytics = (roundId: number | null, enabled: boolean) =>
  useSWR(
    enabled && roundId ? ["analytics", roundId] : null,
    () => getRoundAnalytics(roundId as number),
    STABLE,
  );

export const useRemainderRoute = (roundId: number | null, address: string | null) =>
  useSWR(
    roundId && address ? ["remainder-route", roundId, address.toLowerCase()] : null,
    () => getRemainderRoute(roundId as number, address as string),
    { ...STABLE, refreshInterval: 20_000 },
  );
