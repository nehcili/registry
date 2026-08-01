# Chen Baby's Registry

A cute, minimal baby registry website — public registry + password-protected internal tracking.

**Live at:** `https://nehcili.github.io/baby/`

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Public Registry | `index.html` | 46 registry items across 10 sections. Guests click "I'll help" to pledge. |
| Internal Tracking | `internal.html` | All 70 items with done checkboxes. Password-protected. |

## How It Works

- **Data** lives in `baby-needs.yaml` — edit that file to add/remove items or mark them done.
- **Build:** Run `python3 build.py` to regenerate `data.js` from the YAML.
- **Counters** are stored in Firebase Firestore — global, real-time, persistent.
- **IP hashing** prevents spam: each visitor's IP is SHA-256 hashed before storage.

## Setup (One-Time)

1. Make sure `firebase-config.js` has your Firebase project config (already set up for `chen-baby-registry`).
2. Make sure Firestore Database is enabled in **test mode** (or apply the security rules below).
3. Push to GitHub → enable Pages on the `main` branch → done.

### Firestore Security Rules

Paste these into Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /pledges/{itemId} {
      allow read: if true;
      allow create, update: if request.resource.data.count == request.resource.data.ips.size();
    }
  }
}
```

## Update Flow

```bash
# 1. Edit the data
vim baby-needs.yaml

# 2. Rebuild
python3 build.py

# 3. Deploy
git add baby-needs.yaml data.js
git commit -m "update registry"
git push
```

## Local Preview

```bash
cd /path/to/baby
python3 -m http.server 8000
# Open http://localhost:8000
# Internal: http://localhost:8000/internal.html
```

## File Overview

```
baby/
├── baby-needs.yaml       # ✏️ Source data — edit this
├── build.py              # 🔧 YAML → data.js converter
├── data.js               # 🤖 Generated — don't edit
├── firebase-config.js    # ⚙️ Firebase config
├── index.html            # 🌐 Public registry
├── internal.html         # 🔒 Internal tracking
├── styles.css            # 🎨 Blush & Sage styles
├── app.js                # 🧠 All logic
├── .nojekyll             # 📄 GitHub Pages helper
└── README.md             # 📖 You're reading it
```
