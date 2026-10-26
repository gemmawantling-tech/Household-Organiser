#!/usr/bin/env python3
"""Read-only comparison of public production assets with a known Git ref.

Run from the repository root: python3 scripts/check-production.py --ref origin/main
A successful GitHub Pages job alone does not prove that the correct assets are live.
"""
import argparse
import concurrent.futures
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--ref', default='origin/main')
parser.add_argument('--base-url', default='https://gemmawantling-tech.github.io/Household-Organiser/')
args = parser.parse_args()
files = ['gifts-model.js', 'gifts-ui.js', 'gifts-service.js', 'index.html', 'events.js', 'calendar.js', 'tasks.js', 'sync.js', 'ui.js',
         'organiser.css', 'updates.js', 'sw.js', 'invitation.js', 'manifest.webmanifest',
         'Family/index.html', 'Family/family.js', 'Inventory/index.html',
         'Inventory/app.js', 'Inventory/planner.js', 'Inventory/recipe-library.js',
         'Inventory/sw.js', 'Inventory/pantry-view.html', 'Inventory/three-week-review.html']

def compare(path):
    expected = subprocess.run(['git', 'show', args.ref + ':' + path], capture_output=True)
    if expected.returncode:
        # Older production refs do not contain the new modules yet.
        return {'path': path, 'source': 'absent', 'matches': None}
    try:
        request = urllib.request.Request(args.base_url.rstrip('/') + '/' + path + '?release-check=1',
                                         headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=20) as response:
            actual = response.read()
        return {'path': path, 'matches': actual == expected.stdout,
                'sha256': hashlib.sha256(actual).hexdigest()}
    except (urllib.error.URLError, TimeoutError) as error:
        return {'path': path, 'matches': False, 'error': str(error)}

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    results = list(pool.map(compare, files))
print(json.dumps({'ref': args.ref, 'assets': results}, indent=2))
sys.exit(1 if any(item['matches'] is False for item in results) else 0)
