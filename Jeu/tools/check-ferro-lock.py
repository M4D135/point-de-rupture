#!/usr/bin/env python3
"""Fail a build if a vendored FERRO module diverged from its reference lock."""
import hashlib,json,pathlib,sys
root=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
lock=json.loads((root/'FERRO.lock.json').read_text())
bad=[m['path'] for m in lock['modules'] if not (root/m['path']).is_file() or hashlib.sha256((root/m['path']).read_bytes()).hexdigest()!=m['sha256']]
if bad:raise SystemExit('FERRO '+lock['version']+' diverged: '+', '.join(bad))
print('FERRO '+lock['version']+': '+str(len(lock['modules']))+' reference modules verified')
