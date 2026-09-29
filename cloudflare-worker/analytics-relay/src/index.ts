interface Env { ANALYTICS_RELAY_ENABLED?: string; ANALYTICS_POSTHOG_SCHEDULE_TOKEN?: string; }
const ENDPOINT = 'https://ninochavez.co/photography/api/internal/analytics-posthog';

/** Scheduled delivery only. The public HTTP surface cannot trigger exports. */
export async function runRelay(env: Env, fetcher: typeof fetch = fetch): Promise<{state: string; batches: number}> {
 if (env.ANALYTICS_RELAY_ENABLED !== 'true') return {state:'disabled',batches:0};
 const token=env.ANALYTICS_POSTHOG_SCHEDULE_TOKEN;
 if (!token || token.length < 32) throw Error('analytics_relay_secret_missing');
 let batches=0;
 // Bound work per invocation. Database leases prevent concurrent double claims.
 for (;batches<4;) {
  const response=await fetcher(ENDPOINT,{method:'POST',redirect:'error',headers:{'x-analytics-posthog-schedule-token':token},signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error(`analytics_relay_http_${response.status}`);
  const result=await response.json() as {ok?:boolean;health?:{pending?:number};delivery?:{claimed?:number}};
  if(result.ok!==true)throw Error('analytics_relay_unavailable');
  batches++;
  if(!result.delivery?.claimed || !result.health?.pending)break;
 }
 return {state:'ran',batches};
}
export default {
 async scheduled(_event: unknown,env:Env) { console.log(JSON.stringify(await runRelay(env))); },
 async fetch() { return new Response('Not found',{status:404}); }
};
