/**
 * Apply the rule table to a set of files.
 *
 * Pure: it is handed the list of paths and a way to read bytes, and it returns
 * findings. No git, no filesystem, no exit codes. The CLI in `cli.mjs` supplies
 * a real checkout; the tests supply a synthetic one, and can therefore assert
 * that each category actually refuses without committing a refusable file to a
 * public repository in order to find out.
 */
import { RULES, RULE_IDS } from "./rules.mjs";

/**
 * An allowlist exempts one exact path from one named rule.
 *
 * Exact, not glob, and that is the whole design. A glob is a rule that a later
 * file can join without anybody reviewing it: allowlist `fixtures/public/**`
 * once and every file dropped into that directory afterwards is exempt by
 * default. An exact path means a person had to write the name down.
 *
 * Shape: `{ "<rule-id>": ["exact/path", ...] }`.
 */
export function normaliseAllowlist(raw) {
  const allow = new Map();
  const problems = [];
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (key.startsWith("$")) continue;            // $comment and friends
    if (!RULE_IDS.includes(key)) {
      problems.push(`allowlist names an unknown rule: ${key}`);
      continue;
    }
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      problems.push(`allowlist entry ${key} is not an array of strings`);
      continue;
    }
    for (const path of value) {
      if (/[*?[\]]/.test(path)) {
        problems.push(`allowlist entry ${key} -> ${path} looks like a glob; exact paths only`);
        continue;
      }
      if (!allow.has(key)) allow.set(key, new Set());
      allow.get(key).add(path);
    }
  }
  return { allow, problems };
}

/**
 * @param {object} options
 * @param {string[]} options.files    repository-relative paths, forward slashes
 * @param {(file: string) => Buffer|null} options.read  bytes, or null if unreadable
 * @param {object} [options.allowlist]
 * @returns {{findings: Finding[], stale: string[], problems: string[], checked: number}}
 */
export function checkPrivacy({ files, read, allowlist = {} }) {
  const { allow, problems } = normaliseAllowlist(allowlist);
  const used = new Set();

  const exempt = (ruleId, file) => {
    if (!allow.get(ruleId)?.has(file)) return false;
    used.add(`${ruleId}\u0000${file}`);
    return true;
  };

  const findings = [];
  let checked = 0;

  for (const file of files) {
    const pathRules = RULES.filter((r) => r.kind === "path");
    let refusedByPath = false;

    for (const rule of pathRules) {
      const hit = rule.match(file);
      if (!hit) continue;
      if (exempt(rule.id, file)) continue;
      findings.push({ rule: rule.id, title: rule.title, why: rule.why, file,
        detail: typeof hit === "string" ? hit : null });
      refusedByPath = true;
    }

    // A file already refused for its path is not also read. Reading it would
    // add nothing - it is not going to be published either way - and on a
    // refused archive or media blob it is a needless megabyte.
    if (refusedByPath) continue;

    const bytes = read(file);
    if (bytes === null) continue;                  // deleted in the working tree
    checked += 1;

    for (const rule of RULES) {
      if (rule.kind !== "content") continue;
      const hit = rule.match(file, bytes);
      if (!hit) continue;
      if (exempt(rule.id, file)) continue;
      findings.push({ rule: rule.id, title: rule.title, why: rule.why, file,
        detail: typeof hit === "string" ? hit : null });
    }
  }

  // An allowlist entry that no longer matches anything is not harmless. It is
  // a standing exemption for a path somebody could recreate, and it makes the
  // allowlist read as though more is reviewed than is. Stale entries are
  // reported so they get deleted.
  const stale = [];
  for (const [ruleId, paths] of allow) {
    for (const path of paths) {
      if (!used.has(`${ruleId}\u0000${path}`)) stale.push(`${ruleId} -> ${path}`);
    }
  }

  return { findings, stale: stale.sort(), problems, checked };
}

/** Render findings the way a person reads them: grouped by rule, with the reason. */
export function formatReport({ findings, stale, problems, checked }, { files }) {
  const lines = [];
  if (problems.length) {
    lines.push("Allowlist problems:");
    for (const p of problems) lines.push(`  ${p}`);
    lines.push("");
  }
  if (stale.length) {
    lines.push("Stale allowlist entries - these exempt nothing and should be deleted:");
    for (const s of stale) lines.push(`  ${s}`);
    lines.push("");
  }
  if (findings.length) {
    const byRule = new Map();
    for (const f of findings) {
      if (!byRule.has(f.rule)) byRule.set(f.rule, []);
      byRule.get(f.rule).push(f);
    }
    for (const [rule, group] of byRule) {
      lines.push(`REFUSED - ${group[0].title} (${rule})`);
      lines.push(`  ${group[0].why}`);
      for (const f of group) {
        lines.push(`    ${f.file}${f.detail ? ` - ${f.detail}` : ""}`);
      }
      lines.push("");
    }
    lines.push(
      "To publish one of these deliberately, add its EXACT path under the rule id in",
      "privacy-allowlist.json, with a comment saying who reviewed it and why it is safe.",
    );
  } else if (!problems.length && !stale.length) {
    lines.push(`Privacy check passed: ${files.length} tracked files, ${checked} read.`);
  }
  return lines.join("\n");
}
