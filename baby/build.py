#!/usr/bin/env python3
"""Convert baby-needs.yaml → data.js for the baby registry website.

Usage:
    python3 build.py

Output:
    data.js — sets window.REGISTRY_DATA with all sections and items
"""

import yaml
import json
from datetime import datetime, timezone

# Load YAML
with open('baby-needs.yaml', 'r', encoding='utf-8') as f:
    data = yaml.safe_load(f)

# Build payload
payload = {
    'generated_at': datetime.now(timezone.utc).isoformat(),
    'sections': data['sections'],
}

# Write data.js
with open('data.js', 'w', encoding='utf-8') as f:
    f.write('window.REGISTRY_DATA = ')
    json.dump(payload, f, ensure_ascii=False, indent=2)
    f.write(';\n')

# Print summary
print("Generated data.js")
print()
total_items = 0
total_registry = 0
for section in data['sections']:
    n_items = len(section['items'])
    n_registry = sum(1 for i in section['items'] if i.get('is_in_registry'))
    total_items += n_items
    total_registry += n_registry
    print(f"  {section['name']:<28} {n_items:>3} items  {n_registry:>3} registry")
print(f"  {'─' * 50}")
print(f"  {'Total':<28} {total_items:>3} items  {total_registry:>3} registry")
