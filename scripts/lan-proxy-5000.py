"""
LAN 公開用プロキシ。

この PC の Windows ファイアウォールは python.exe:5000 は許可するが node.exe は拒否する
ため、printviewer と同じ venv Python で 5000 を開き、内部の Next.js (127.0.0.1:3000) に転送する。
"""
from __future__ import annotations

import urllib.error
import urllib.request
from flask import Flask, Response, request

UPSTREAM = "http://127.0.0.1:3000"
LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 5000

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}

app = Flask(__name__)


def _build_target(path: str) -> str:
    target = f"{UPSTREAM}/{path}".rstrip("/")
    if request.query_string:
        target += "?" + request.query_string.decode("utf-8", errors="replace")
    return target


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
@app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
def proxy(path: str):
    target = _build_target(path)
    body = request.get_data()
    headers = {
        key: value
        for key, value in request.headers
        if key.lower() not in HOP_BY_HOP
    }

    upstream_request = urllib.request.Request(
        target,
        data=body if body else None,
        method=request.method,
        headers=headers,
    )

    try:
        with urllib.request.urlopen(upstream_request, timeout=120) as upstream:
            response_headers = [
                (key, value)
                for key, value in upstream.headers.items()
                if key.lower() not in HOP_BY_HOP
            ]
            return Response(upstream.read(), upstream.status, response_headers)
    except urllib.error.HTTPError as error:
        response_headers = [
            (key, value)
            for key, value in error.headers.items()
            if key.lower() not in HOP_BY_HOP
        ]
        return Response(error.read(), error.code, response_headers)
    except Exception as error:  # noqa: BLE001
        return Response(f"Next.js へ接続できません: {error}", status=502, mimetype="text/plain; charset=utf-8")


if __name__ == "__main__":
    print("=" * 60)
    print(" 合格プログラム LAN プロキシ（printviewer と同じ Python 経由）")
    print(f" LAN proxy http://{LISTEN_HOST}:{LISTEN_PORT} -> {UPSTREAM}")
    print(" 他 PC: http://192.168.0.41:5000/login")
    print(" ※ 赤字・黄色の Flask メッセージが出ればこのモードで動いています")
    print(" ※ printviewer と同時起動不可（どちらも 5000 を使用）")
    print("=" * 60)
    app.run(host=LISTEN_HOST, port=LISTEN_PORT, threaded=True)
