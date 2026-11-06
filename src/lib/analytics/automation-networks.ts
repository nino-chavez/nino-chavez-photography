/**
 * Cheap, defensible automation signal for the event collector.
 *
 * Cloudflare puts `asn` and `asOrganization` on `request.cf` for every plan (no Bot Management
 * needed). Crawlers that run the gallery's JavaScript send real-looking events with Chrome user
 * agents, but they come from hosting, cloud and platform-crawler networks that people do not browse
 * from. An event from one of these networks is counted, but labelled `suspected_automation` so
 * audience reports leave it out.
 *
 * This is a label, not proof. It is deliberately limited to networks that are hosting/cloud
 * infrastructure or a platform's own crawler fleet. Networks that also carry corporate office or cloud-desktop
 * browsing (Microsoft AS8075, Amazon AS16509/AS14618) are left out until evidence shows they send automation here.
 * Meta AS32934 stays because it is the largest measured source; its office traffic is negligible beside it. Residential, mobile, university and corporate
 * ISPs, Cloudflare WARP (AS13335), Apple Private Relay and consumer VPN providers are NOT listed.
 * Add a number only with evidence that it is hosting space; every entry is covered by the test.
 */
export const AUTOMATION_NETWORKS = {
	// Platform crawler fleets
	32934: 'Meta (link-preview and crawler fleet)',
	209366: 'SEMrush',
	// Hosting and cloud providers
	24940: 'Hetzner',
	203020: 'HostRoyale',
	207990: 'HostRoyale',
	136907: 'Huawei Cloud',
	16276: 'OVH',
	20473: 'Vultr / Constant',
	132203: 'Tencent Cloud',
	45090: 'Tencent Cloud',
	45102: 'Alibaba Cloud',
	396982: 'Google Cloud',
	14061: 'DigitalOcean',
	63949: 'Linode / Akamai Connected Cloud',
	31898: 'Oracle Cloud',
	51167: 'Contabo',
	12876: 'Scaleway',
	60781: 'Leaseweb',
	28753: 'Leaseweb'
} as const satisfies Record<number, string>;

export type AutomationSignal = { asn: number; network: string };

/** Subset of Cloudflare's `request.cf` this module reads. Everything is optional: local dev has no `cf`. */
export type RequestNetwork = { asn?: unknown } | null | undefined;

/** Returns the matching signal, or null when the network is not on the list or is unknown. */
export function automationNetworkSignal(cf: RequestNetwork): AutomationSignal | null {
	const asn = typeof cf?.asn === 'number' ? cf.asn : typeof cf?.asn === 'string' && /^\d{1,10}$/.test(cf.asn) ? Number(cf.asn) : NaN;
	if (!Number.isSafeInteger(asn)) return null;
	const network = (AUTOMATION_NETWORKS as Record<number, string>)[asn];
	return network ? { asn, network } : null;
}

/**
 * Only would-be audience traffic is relabelled. Proven operator, test and self-excluded context is
 * never overridden, so a signed test run from a cloud runner stays `test`.
 */
export function labelTrafficByNetwork<T extends string>(context: T, cf: RequestNetwork): { context: T | 'suspected_automation'; signal: AutomationSignal | null } {
	const signal = context === 'audience' ? automationNetworkSignal(cf) : null;
	return { context: signal ? 'suspected_automation' : context, signal };
}

/**
 * A dev server pointed at a remote (non-local) database is not audience: it is a developer's own
 * browser writing to production data. Local databases keep the context so local verification still sees audience events.
 */
export function labelDevelopmentTraffic<T extends string>(context: T, localDevelopment: boolean, databaseUrl: string | undefined): T | 'test' {
	if (context !== 'audience' || !localDevelopment) return context;
	let host = '';
	try { host = new URL(databaseUrl ?? '').hostname; } catch { /* unknown database: treat as remote */ }
	return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' ? context : 'test';
}

/** Header the ninochavez.co router sets to the visitor's `cf.asn`; the router always overwrites any incoming value. */
export const ROUTER_CLIENT_ASN_HEADER = 'x-nc-client-asn';
/** Cloudflare adds `CF-Worker: <zone that owns the Worker>` to Worker subrequests. https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-worker */
const ROUTER_ZONE = 'ninochavez.co';

/**
 * Whose network does `request.cf` describe? Behind the router, the Pages Function sees the router's
 * subrequest connection, so the visitor's ASN comes from the router's header, trusted only when the
 * request carries `CF-Worker: ninochavez.co`. A direct pages.dev hit has no CF-Worker header and its own
 * `cf` is the visitor's. Any other Worker subrequest, or a router request without the header, has no
 * reliable visitor network: return null (unlabelled) rather than classify Cloudflare's own network.
 * Limit: a direct caller could forge both headers to pose as any ASN; that only lets it dodge its own label.
 */
export function visitorNetwork(headers: Pick<Headers, 'get'>, cf: RequestNetwork): RequestNetwork {
	const worker = headers.get('cf-worker');
	if (!worker) return cf;
	if (worker.toLowerCase() !== ROUTER_ZONE) return null;
	const asn = headers.get(ROUTER_CLIENT_ASN_HEADER);
	return asn && /^\d{1,10}$/.test(asn) ? { asn: Number(asn) } : null;
}
