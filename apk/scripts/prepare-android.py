#!/usr/bin/env python3
"""Prépare le projet Android généré par `npx cap add android` :
permissions de localisation, icône de l'application, icône de notification."""
import os, re, shutil
from PIL import Image, ImageDraw

RES = "android/app/src/main/res"
MANIFEST = "android/app/src/main/AndroidManifest.xml"
SRC = "assets/icon-512.png"

# 1. Permissions de localisation (détection automatique des sites)
m = open(MANIFEST, encoding="utf-8").read()
for perm in ("ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "VIBRATE"):
    tag = f'<uses-permission android:name="android.permission.{perm}" />'
    if perm not in m:
        m = m.replace("</manifest>", f"    {tag}\n</manifest>")
open(MANIFEST, "w", encoding="utf-8").write(m)


# 1b. Visibilité des applis (Android 11+) : Google Maps, Grab, liens web, Play Store
m = open(MANIFEST, encoding="utf-8").read()
if "<queries>" not in m:
    q = """    <queries>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="geo" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="grab" /></intent>
        <package android:name="com.grabtaxi.passenger" />
        <package android:name="ee.mtakso.client" />
        <package android:name="com.google.android.apps.maps" />
    </queries>
"""
    m = m.replace("</manifest>", q + "</manifest>")
    open(MANIFEST, "w", encoding="utf-8").write(m)

# 2. Icône de l'application (on retire l'icône adaptative du modèle, on met nos PNG)
shutil.rmtree(f"{RES}/mipmap-anydpi-v26", ignore_errors=True)
src = Image.open(SRC).convert("RGBA")
for dens, px in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
    d = f"{RES}/mipmap-{dens}"
    os.makedirs(d, exist_ok=True)
    img = src.resize((px, px), Image.LANCZOS)
    img.save(f"{d}/ic_launcher.png")
    img.save(f"{d}/ic_launcher_foreground.png")
    mask = Image.new("L", (px, px), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px - 1, px - 1), fill=255)
    rnd = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    rnd.paste(img, (0, 0), mask)
    rnd.save(f"{d}/ic_launcher_round.png")

# 3. Icône de notification : silhouette blanche sur fond transparent
for dens, px in (("mdpi", 24), ("hdpi", 36), ("xhdpi", 48), ("xxhdpi", 72), ("xxxhdpi", 96)):
    d = f"{RES}/drawable-{dens}"
    os.makedirs(d, exist_ok=True)
    big = Image.new("RGBA", (px * 4, px * 4), (0, 0, 0, 0))
    dr = ImageDraw.Draw(big)
    S = px * 4
    dr.rounded_rectangle((S * .08, S * .14, S * .92, S * .86), radius=S * .14, outline=(255, 255, 255, 255), width=int(S * .09))
    dr.ellipse((S * .36, S * .36, S * .64, S * .64), fill=(255, 255, 255, 255))
    big.resize((px, px), Image.LANCZOS).save(f"{d}/ic_stat_thai.png")

print("Projet Android préparé.")
