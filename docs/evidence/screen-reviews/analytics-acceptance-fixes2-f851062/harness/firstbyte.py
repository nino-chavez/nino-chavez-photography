import subprocess, time, os, json, statistics
# When the page's own markup (the headline) reaches a client, with and without compression, on each local build. 7 loads each.
out = {}
for label, port in (('before', 8810), ('after', 8811)):
    for enc in ('plain', 'gzip'):
        rows = []
        for _ in range(7):
            cmd = ['curl', '-sN', '-o', '-', f'http://127.0.0.1:{port}/photography/analytics/data']
            if enc == 'gzip':
                cmd.insert(2, '--compressed')
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
            t0 = time.time(); buf = b''; first_byte = None; h1 = None; end = None
            while True:
                b = os.read(p.stdout.fileno(), 65536)
                if not b:
                    break
                if first_byte is None:
                    first_byte = time.time() - t0
                buf += b
                if h1 is None and b'<h1' in buf:
                    h1 = time.time() - t0
            end = time.time() - t0
            rows.append((first_byte, h1, end))
            time.sleep(1)
        med = lambda i: round(statistics.median(r[i] for r in rows if r[i] is not None) * 1000)
        out[f'{label} {enc}'] = {'first body byte ms': med(0), 'headline in the markup ms': med(1), 'last byte ms': med(2)}
print(json.dumps(out, indent=1))
open('/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/perf2/firstbyte.json', 'w').write(json.dumps(out, indent=1))
