export function load({setHeaders}: {setHeaders: (headers: Record<string,string>) => void}) { setHeaders({'cache-control':'no-store', 'x-robots-tag':'noindex'}); return {}; }
