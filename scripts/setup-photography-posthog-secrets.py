#!/usr/bin/env python3
"""Store photography PostHog project capture keys in 1Password; never print keys.
Run in a PTY for the desktop-authorized write path. Does not enable collection.
"""
import argparse, json, os, subprocess, urllib.request, uuid
parser=argparse.ArgumentParser()
parser.add_argument('--apply',action='store_true')
args=parser.parse_args()
projects={'PostHog photography':635866,'PostHog photography-test':635867}
if not args.apply:
    print(json.dumps({'mode':'dry run','items':projects}));raise SystemExit

def op(arguments,write=False,payload=None):
    env=os.environ.copy()
    if write: env.pop('OP_SERVICE_ACCOUNT_TOKEN',None)
    command=['op']+(['--account','my.1password.com'] if write else [])+arguments
    result=subprocess.run(command,input=json.dumps(payload) if payload is not None else '',capture_output=True,text=True,env=env,timeout=120)
    if result.returncode: raise RuntimeError('1Password operation failed; inspect authorization/session, not secret output')
    return json.loads(result.stdout) if result.stdout.strip().startswith(('{','[')) else result.stdout.strip()

items=op(['item','list','--vault','Developer Secrets','--format','json'])
existing={x['title']:x['id'] for x in items}
management=op(['item','get','PostHog rally-hq','--vault','Developer Secrets','--format','json'])
key=next(f['value'] for f in management['fields'] if f['label']=='personal_api_key')
template=op(['item','template','get','API Credential','--format','json'])

def make_item(title,values):
    value=json.loads(json.dumps(template));value['title']=title
    for field in value['fields']:
        if field['id'] in values:field['value']=values.pop(field['id'])
    value['fields'] += [{'id':name,'label':name,'type':'STRING','value':str(v)} for name,v in values.items()]
    return value

# Disposable canary verifies the authorized writer and read-only consumer.
canary_title='PostHog photography-write-canary-'+uuid.uuid4().hex[:8]
canary_value=uuid.uuid4().hex
canary=op(['item','create','--vault','Developer Secrets','--format','json'],True,make_item(canary_title,{'credential':canary_value}))
assert op(['read',f'op://Developer Secrets/{canary["id"]}/credential'])==canary_value
op(['item','delete',canary['id'],'--vault','Developer Secrets'],True)
for title,project in projects.items():
    if title in existing:
        print(title+': exists, preserved');continue
    request=urllib.request.Request(f'https://us.posthog.com/api/projects/{project}/',headers={'Authorization':'Bearer '+key})
    with urllib.request.urlopen(request,timeout=20) as response: data=json.load(response)
    token=data['api_token']
    created=op(['item','create','--vault','Developer Secrets','--format','json'],True,make_item(title,{'credential':token,'hostname':'https://us.i.posthog.com','project_id':str(project),'notesPlain':'Capture key only. Query access requires a separate project-scoped read-only credential. No personal or cross-project management key is stored here.'}))
    assert op(['read',f'op://Developer Secrets/{created["id"]}/credential'])==token
    print(title+': capture key saved and read-back verified')
