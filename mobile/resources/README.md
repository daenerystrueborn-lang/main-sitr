# App logo + splash

Everything here is generated from one logo. To change it:

    pip install pillow
    python3 scripts/make-resources.py path/to/your-logo.png

Then commit `mobile/resources/`. The next GitHub Actions build uses it for the launcher icon,
the Android splash and the in-app splash screen (`logo.png`). Use a square PNG, 1024x1024 or bigger.
