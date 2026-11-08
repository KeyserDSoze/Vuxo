#!/usr/bin/env node
// #142: default read-only; exact merged PR heads from 2026-11-08.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const CANDIDATES = Object.freeze([
  {
    "branch": "docs/121-ste100-google-microsoft-setup",
    "sha": "ed3885a3069186f98f1dec162a6ffed8aff73688",
    "pr": 123
  },
  {
    "branch": "feat/guardian-battle-history-90",
    "sha": "f1cccbadb703d85c26ed00cc267c9cbf5c516f0f",
    "pr": 91
  },
  {
    "branch": "feat/guardian-feint-v2-94",
    "sha": "ba99ebddf2ec5c35833356cffc0ff8147179f37b",
    "pr": 96
  },
  {
    "branch": "feat/inventory-consumable-healing-81",
    "sha": "2e157c017a4630f0edf4549479812a089111d2b2",
    "pr": 82
  },
  {
    "branch": "feat/offworld-refuge-rune-training-71",
    "sha": "d2404c104beaca20abc3a8aa1e5f677f67dc6741",
    "pr": 74
  },
  {
    "branch": "feat/persistent-character-health-75",
    "sha": "85191cdd1876ecf5ff139511003910e2c5246d08",
    "pr": 76
  },
  {
    "branch": "feat/portal-first-mistake-damage-83",
    "sha": "28f56b11d3c9737693d42495f57549bae919600e",
    "pr": 84
  },
  {
    "branch": "feat/portal-guardian-pve-87",
    "sha": "f76ca5b1072526b11328a78609ef35650726ae2d",
    "pr": 88
  },
  {
    "branch": "feat/refuge-server-rest-78",
    "sha": "58320686db3a8d8990f145be167722e38f677e1e",
    "pr": 79
  },
  {
    "branch": "feat/server-portal-encounter-lock-85",
    "sha": "be4d46b6ed88a9b840302c9fb61c41047d2d8a65",
    "pr": 86
  },
  {
    "branch": "feature/interactive-world-portals-0.0.1",
    "sha": "a1cd2b89729c01ff61067e302eaefdf2a882d743",
    "pr": 53
  },
  {
    "branch": "feature/inventory-atomic-portal-rewards-0.0.1",
    "sha": "ab0162a09dad83c5d8c97c8765904168bfac5184",
    "pr": 55
  },
  {
    "branch": "feature/inventory-equipment-stacks-0.0.1",
    "sha": "558114e02b3fd0857cccaaeb446ef530b7373f1d",
    "pr": 57
  },
  {
    "branch": "feature/portal-memory-challenge-0.0.1",
    "sha": "011a5f0fa25bd4c59d2aeec9d0bca5bc0c842735",
    "pr": 51
  },
  {
    "branch": "feature/93-refuge-reflex-main",
    "sha": "5c660fca2550a0cc74ac5de6133453ea0a99a9bb",
    "pr": 133
  },
  {
    "branch": "feature/97-refuge-rune-path-main",
    "sha": "92a7332b1630f2bcccd65ab0e6aed435ea38aeec",
    "pr": 134
  },
  {
    "branch": "feature/109-immersive-landing",
    "sha": "32ee2a29fff282a0601db73ed3bedbe1391f7822",
    "pr": 111
  },
  {
    "branch": "feature/113-home-rune-teaser-main",
    "sha": "1193e7832a9919b6579105a852273f5e42f9e53f",
    "pr": 128
  },
  {
    "branch": "feature/115-inventory-browse-main",
    "sha": "f55da2aa6e45f4fb3be8257dd9657525460bdcfb",
    "pr": 129
  },
  {
    "branch": "feature/116-inventory-loadout-main",
    "sha": "76bd9c1a2b76c6dedf3336a5128d193f6153e366",
    "pr": 131
  },
  {
    "branch": "feature/118-refuge-journal-main",
    "sha": "199a1db072dc8ba3021b06e41763d742da3dcd0c",
    "pr": 141
  },
  {
    "branch": "fix/account-provider-retry-68",
    "sha": "083b13da1aef994155fd3be478bccc5adeffae45",
    "pr": 69
  },
  {
    "branch": "fix/account-session-sync-66",
    "sha": "cdc56ead1be850c684d3cd78dade36d3367323fa",
    "pr": 67
  },
  {
    "branch": "fix/frontend-shell-admin-home-playwright-62",
    "sha": "fe109816ed729854b78736a5c0b5feadeb25306b",
    "pr": 63
  },
  {
    "branch": "fix/121-msal5-popup-bridge",
    "sha": "44fee1bf89224ae1b6db19a979832d69ab979e0c",
    "pr": 122
  },
  {
    "branch": "fix/121-pages-deploy-main-updates",
    "sha": "0dce9ec2c676afe37f2c5e3bfae034aebe7c7278",
    "pr": 127
  },
  {
    "branch": "fix/121-pi3-auth-provider-verification",
    "sha": "dfcf3ed3d676e49ee4aa16a8a8f43dc04d4fa5ca",
    "pr": 124
  },
  {
    "branch": "fix/128-canonical-vuxo-quest-oauth",
    "sha": "f109a85540d1bfa61bd3768e6b1cf5066272291f",
    "pr": 132
  },
  {
    "branch": "fix/134-google-gis-initialize-once",
    "sha": "28d5ac2a08a110c4a144f3a6ecf9a5ca017b538a",
    "pr": 137
  },
  {
    "branch": "fix/138-msal-popup-user-gesture",
    "sha": "7ddfd09df8523f93a6beda9e359b0646e2e5388f",
    "pr": 140
  },
  {
    "branch": "infra/pi3-arm64-runtime",
    "sha": "b1cacb0b3439735a5d074945858964d99062b893",
    "pr": 61
  },
  {
    "branch": "perf/frontend-lazy-game-route-64",
    "sha": "5e960308b7a7b3e151cbd2b8d2b9ebd13b63f8ab",
    "pr": 65
  },
  {
    "branch": "test/121-public-social-auth-smoke",
    "sha": "ee73748836399fbab9086564930df8fcbf3cf399",
    "pr": 125
  }
]);

export function classify(candidate, branches, closedPulls, openPulls, repoName) {
  if (!candidate || candidate.branch === 'main' ||
      !/^[A-Za-z0-9_./-]+$/.test(candidate.branch) ||
      candidate.branch.includes('..') || candidate.branch.startsWith('/')) return 'unsafe_branch';
  const branch = branches.find(item => item.name === candidate.branch);
  if (!branch) return 'branch_missing';
  if (branch.protected) return 'protected';
  if (branch.commit?.sha !== candidate.sha) return 'branch_changed';
  if (openPulls.some(pr => pr.head?.ref === candidate.branch ||
                           pr.base?.ref === candidate.branch)) return 'used_by_open_pr';
  const pr = closedPulls.find(item => item.number === candidate.pr);
  if (!pr || !pr.merged_at || pr.head?.ref !== candidate.branch ||
      pr.head?.sha !== candidate.sha ||
      pr.head?.repo?.full_name !== repoName) return 'not_exact_merged_pr_head';
  return 'eligible';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await main(); }
  catch (error) {
    console.error('Pruning aborted: ' + (error instanceof Error ? error.message : 'unexpected error'));
    process.exitCode = 1;
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  if (repo !== 'KeyserDSoze/Vuxo' || !token)
    throw new Error('Expected VUXO GitHub Actions repository and token');
  if (apply && (process.env.GITHUB_ACTIONS !== 'true' ||
                process.env.GITHUB_REF !== 'refs/heads/main' ||
                process.env.PRUNE_APPROVED !== 'true'))
    throw new Error('Deletion requires approved GitHub Actions run on main');
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  async function api(path, method = 'GET', missingOk = false) {
    const response = await fetch('https://api.github.com/repos/' + repo + '/' + path, {
      method, headers, signal: AbortSignal.timeout(20000),
    });
    if (missingOk && response.status === 404) return null;
    if (!response.ok) throw new Error(method + ' ' + path + ': HTTP ' + response.status);
    if (response.status === 204) return null;
    return response.json();
  }
  async function pages(path) {
    const records = [];
    for (let page = 1; page <= 20; page++) {
      const result = await api(path + (path.includes('?') ? '&' : '?') +
                               'per_page=100&page=' + page);
      if (!Array.isArray(result)) throw new Error('Invalid response for ' + path);
      records.push(...result);
      if (result.length < 100) return records;
    }
    throw new Error('Pagination safety limit reached for ' + path);
  }
  // All evidence is read before any write; incomplete reads fail closed.
  const [branches, closedPulls, openPulls] = await Promise.all([
    pages('branches'), pages('pulls?state=closed'), pages('pulls?state=open'),
  ]);
  const eligible = [];
  for (const candidate of CANDIDATES) {
    const status = classify(candidate, branches, closedPulls, openPulls, repo);
    if (status === 'eligible') eligible.push(candidate);
    else console.log('SKIP ' + candidate.branch + ' (' + status + ')');
  }
  console.log('Audited ' + CANDIDATES.length + ' exact merged heads; eligible=' +
              eligible.length + '; mode=' + (apply ? 'APPLY' : 'DRY_RUN'));
  if (!apply) {
    for (const candidate of eligible) console.log('PREVIEW #' + candidate.pr + ': ' + candidate.branch);
    return;
  }
  let deleted = 0;
  for (const candidate of eligible) {
    const encoded = candidate.branch.split('/').map(encodeURIComponent).join('/');
    const detail = await api('branches/' + encoded, 'GET', true);
    if (!detail || detail.protected || detail.commit?.sha !== candidate.sha) {
      console.log('SKIP changed/protected/missing: ' + candidate.branch);
      continue;
    }
    const nowOpen = await pages('pulls?state=open');
    if (nowOpen.some(pr => pr.head?.ref === candidate.branch ||
                           pr.base?.ref === candidate.branch)) {
      console.log('SKIP newly referenced: ' + candidate.branch);
      continue;
    }
    await api('git/refs/heads/' + encoded, 'DELETE');
    console.log('DELETED #' + candidate.pr + ': ' + candidate.branch);
    deleted++;
  }
  console.log('RESULT deleted=' + deleted + '; eligible=' + eligible.length +
              '; allowlisted=' + CANDIDATES.length);
}
