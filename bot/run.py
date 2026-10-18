"""MERO VPN bot launcher for a Python-only host (h1cloud / Pterodactyl python egg).

On every start it downloads the latest bot code from GitHub, fetches a Node.js
binary once, loads secrets from .env next to this file and runs bot.js.
Put this file and .env in the server root and set PY_FILE=run.py.
"""
import io, os, platform, shutil, sys, tarfile, urllib.request, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO_ZIP = "https://github.com/timir2418dima-byte/mero-vpn/archive/refs/heads/main.zip"
NODE_VERSION = "v22.11.0"
APP = os.path.join(ROOT, "app")
NODE = os.path.join(ROOT, "node", "bin", "node")


def log(msg):
    print(f"[run.py] {msg}", flush=True)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "mero-vpn-launcher"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def ensure_node():
    if os.path.exists(NODE):
        return
    arch = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine().lower(), "x64")
    name = f"node-{NODE_VERSION}-linux-{arch}"
    log(f"downloading Node.js {NODE_VERSION} ({arch})")
    data = fetch(f"https://nodejs.org/dist/{NODE_VERSION}/{name}.tar.xz")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:xz") as tar:
        member = tar.getmember(f"{name}/bin/node")
        member.name = "node"
        tar.extract(member, os.path.join(ROOT, "node", "bin"))
    os.chmod(NODE, 0o755)


def update_code():
    try:
        data = fetch(REPO_ZIP)
    except Exception as e:  # keep the last good copy when GitHub is unreachable
        log(f"code update skipped: {e}")
        return
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        prefix = z.namelist()[0].split("/")[0] + "/bot/"
        for item in z.infolist():
            if not item.filename.startswith(prefix) or item.is_dir():
                continue
            rel = item.filename[len(prefix):]
            dest = os.path.join(APP, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with z.open(item) as src, open(dest, "wb") as out:
                shutil.copyfileobj(src, out)
    log("bot code updated from GitHub")


def load_env():
    env = dict(os.environ)
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        log("no .env next to run.py: create it with BOT_TOKEN and the other settings")
        sys.exit(1)
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip("'\"")
    return env


if __name__ == "__main__":
    ensure_node()
    update_code()
    env = load_env()
    os.chdir(APP)
    log("starting bot.js")
    os.execve(NODE, [NODE, "bot.js"], env)
