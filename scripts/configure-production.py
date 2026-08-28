from __future__ import annotations

import os
import subprocess
from pathlib import Path


ONLINE_DIR = Path(__file__).resolve().parents[1]
VERCEL_CLI = ONLINE_DIR / "node_modules" / "vercel" / "dist" / "vc.js"


def add_secret(name: str, value: str) -> None:
    if not value:
        raise RuntimeError(f"{name} is empty")
    result = subprocess.run(
        [
            "node",
            str(VERCEL_CLI),
            "env",
            "add",
            name,
            "production",
            "--force",
            "--sensitive",
            "--yes",
            "--scope",
            "lizhuofan-currys-projects",
        ],
        cwd=ONLINE_DIR,
        input=value + "\n",
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if result.returncode:
        safe_error = "\n".join(
            line for line in (result.stderr or result.stdout).splitlines()
            if value not in line
        )
        raise RuntimeError(f"Failed to configure {name}: {safe_error[-800:]}")
    print(f"configured {name}")


def main() -> None:
    variables = {
        "DEEPSEEK_API_KEY": os.environ.get("DEEPSEEK_API_KEY", ""),
        "DEEPSEEK_BASE_URL": os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        "DEEPSEEK_MODEL": os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
        "SESSION_SECRET": os.environ.get("SESSION_SECRET", ""),
    }
    for name, value in variables.items():
        add_secret(name, value)


if __name__ == "__main__":
    main()
