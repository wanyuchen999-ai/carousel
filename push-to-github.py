# -*- coding: utf-8 -*-
"""
push-to-github.py — 把本文件夹的网站文件上传到 GitHub 仓库 wanyuchen999-ai/carousel
使用你电脑里已保存的 GitHub 凭据（git credential），不需要手动登录。
用法：python push-to-github.py
以后更新了 index.html 之后重新运行一次即可同步到线上。
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

OWNER, REPO = "wanyuchen999-ai", "carousel"
BRANCH = "main"
SKIP_DIRS = {".git", "node_modules"}
SKIP_FILES = {".DS_Store", "Thumbs.db", "_payload.json", "_check.mjs"}
COMMIT_MSG = "更新网站文件"


def collect_files():
    """自动遍历目录收集全部网站文件（不再维护硬编码清单）"""
    found = []
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in sorted(files):
            if f in SKIP_FILES:
                continue
            rel = os.path.relpath(os.path.join(root, f), ".")
            found.append(rel.replace("\\", "/"))
    return sorted(found)


def get_token():
    out = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True, text=True
    ).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise SystemExit("没有找到 GitHub 凭据，请先在本机登录过 GitHub（git push 一次）")


def api(method, path, payload=None, retries=3):
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, data=data, method=method, headers={
                "Authorization": f"token {TOKEN}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "carousel-uploader",
            })
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 404, {}   # 文件还不存在（首次上传）
            print(f"  第{attempt}次请求失败：{e}")
            if attempt == retries:
                raise
            time.sleep(2)
        except Exception as e:
            print(f"  第{attempt}次请求失败：{e}")
            if attempt == retries:
                raise
            time.sleep(2)


TOKEN = get_token()
print("✓ 已取得 GitHub 凭据")

FILES = collect_files()
print(f"共 {len(FILES)} 个文件待同步")

ok = True
for f in FILES:
    try:
        with open(f, "rb") as fh:
            content = base64.b64encode(fh.read()).decode()
    except FileNotFoundError:
        print(f"- 跳过（不存在）：{f}")
        continue
    # 先查现有文件的 sha（更新时必须带）
    status, old = api("GET", f"contents/{f}?ref={BRANCH}")
    payload = {
        "message": COMMIT_MSG,
        "content": content,
        "branch": BRANCH,
    }
    if status == 200 and isinstance(old, dict) and old.get("sha"):
        payload["sha"] = old["sha"]
    s2, r2 = api("PUT", f"contents/{f}", payload)
    name = r2.get("content", {}).get("path", f) if isinstance(r2, dict) else f
    print(f"✓ 已上传：{name}" if s2 in (200, 201) else f"✗ 上传失败：{f} -> {r2}")
    if s2 not in (200, 201):
        ok = False

print("全部完成！" if ok else "有文件失败，请重试。")
sys.exit(0 if ok else 1)
