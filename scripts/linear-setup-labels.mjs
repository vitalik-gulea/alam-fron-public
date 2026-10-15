#!/usr/bin/env node
// Создаёт лейблы Linear по docs/linear-workflow.md. Идемпотентно: существующие пропускает.
// Использование:
//   LINEAR_API_KEY=lin_api_xxx node scripts/linear-setup-labels.mjs [--team ALM] [--dry-run]
// Без --team лейблы создаются на уровне всего workspace.

const API = "https://api.linear.app/graphql";
const key = process.env.LINEAR_API_KEY;
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const teamKey = args.includes("--team") ? args[args.indexOf("--team") + 1] : null;

const GROUPS = {
  Type: { color: "#5e6ad2", labels: { Bug: "#eb5757", Feature: "#4cb782", Improvement: "#5e6ad2", Chore: "#95a2b3", Docs: "#26b5ce", Research: "#bb87fc" } },
  Area: { color: "#f2994a", labels: { app: "#5e6ad2", installer: "#f2c94c", "auto-update": "#f2994a", "release-ci": "#4cb782", website: "#26b5ce", infra: "#95a2b3" } },
  Platform: { color: "#26b5ce", labels: { macOS: "#95a2b3", Windows: "#4ea7fc", Linux: "#f2c94c" } },
  Flag: { color: "#eb5757", labels: { blocked: "#eb5757", "needs-design": "#bb87fc", "needs-review": "#f2c94c", "breaking-change": "#eb5757", security: "#eb5757", regression: "#f2994a", hotfix: "#eb5757", "good-first-issue": "#4cb782" } },
};

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

if (!key && !dry) {
  console.error("Нужен LINEAR_API_KEY (Linear → Settings → Account → Security & access → API keys).");
  process.exit(1);
}

let teamId = null;
let existing = new Map();
if (key) {
  if (teamKey) {
    const d = await gql(`query($k:String!){teams(filter:{key:{eq:$k}}){nodes{id}}}`, { k: teamKey });
    teamId = d.teams.nodes[0]?.id;
    if (!teamId) throw new Error(`Команда ${teamKey} не найдена`);
  }
  const d = await gql(`query{issueLabels(first:250){nodes{id name parent{name} team{id}}}}`);
  for (const l of d.issueLabels.nodes) existing.set(`${l.parent?.name ?? ""}/${l.name}`, l.id);
}

async function ensure(name, color, parentName, parentId) {
  const k = `${parentName ?? ""}/${name}`;
  if (existing.has(k)) { console.log(`= ${k} (уже есть)`); return existing.get(k); }
  console.log(`+ ${k}`);
  if (dry) return "dry";
  const d = await gql(
    `mutation($i:IssueLabelCreateInput!){issueLabelCreate(input:$i){success issueLabel{id}}}`,
    { i: { name, color, ...(teamId && { teamId }), ...(parentId && { parentId }) } },
  );
  return d.issueLabelCreate.issueLabel.id;
}

for (const [group, { color, labels }] of Object.entries(GROUPS)) {
  const pid = await ensure(group, color);
  for (const [name, c] of Object.entries(labels)) await ensure(name, c, group, pid);
}
console.log(dry ? "Dry-run завершён." : "Готово.");
