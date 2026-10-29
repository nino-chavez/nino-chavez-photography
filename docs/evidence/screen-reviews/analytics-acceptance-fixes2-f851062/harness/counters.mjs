// Read-only: the delivery counters by day, from production, for the B1 rule. SELECT only.
import { createClient } from '~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-ade1328cb3fa1ed6e/node_modules/@supabase/supabase-js/dist/index.mjs';
const url = process.env.PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await admin.from('analytics_collection_delivery_counters').select('bucket_date,schema_version,outcome,count').order('bucket_date');
if (error) { console.error(error.message); process.exit(1); }
const by = new Map();
for (const r of data) { const d = by.get(r.bucket_date) ?? { accepted: 0, rejected: 0, duplicate: 0 }; d[r.outcome] += Number(r.count); by.set(r.bucket_date, d); }
for (const [date, d] of by) console.log(date, JSON.stringify(d));
