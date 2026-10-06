"""HTTP client factory that survives unusual proxy/TLS environments.

Some sandboxes (a) set no_proxy entries (e.g. bare IPv6 literals) that httpx's
trust_env parsing chokes on, and (b) MITM outbound TLS with a custom CA bundle.
We bypass trust_env, pass the proxy explicitly, and use the provided CA bundle
when one exists. In production (no proxy env / no bundle file) this degrades to
httpx defaults.
"""
from __future__ import annotations
import os
import ssl

import httpx

_CA_CANDIDATES = (
    os.environ.get("SSL_CERT_FILE"),
    "/run/hatch/egress-tls/ca-bundle.pem",
)


def _verify():
    for path in _CA_CANDIDATES:
        if path and os.path.exists(path):
            return ssl.create_default_context(cafile=path)
    return True  # httpx default verification


def http_client(timeout: float = 10.0, **kwargs) -> httpx.Client:
    proxy = os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY") or None
    return httpx.Client(timeout=timeout, trust_env=False, proxy=proxy,
                        verify=_verify(), **kwargs)
