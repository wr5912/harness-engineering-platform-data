"""version_tool.py 的 JSON 子进程桥接入口。

stdin 接收 {"left": ..., "right": ...}，stdout 输出 JSON 结果或错误；
version_tool.py 保持原独立业务函数不变，本文件只做进程边界与错误封装。
"""
import json
import platform
import sys
from importlib import metadata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def main() -> int:
    try:
        request = json.load(sys.stdin)
        left = request["left"]
        right = request["right"]
    except Exception as exc:
        json.dump(
            {"ok": False, "error": {"type": type(exc).__name__, "message": "请求 JSON 无效: " + str(exc)}},
            sys.stdout,
        )
        return 3

    try:
        from version_tool import select_newer_version

        value = select_newer_version(left, right)
        runtime = {
            "python": platform.python_version(),
            "packaging": metadata.version("packaging"),
            "bridge": "python3-json-subprocess",
        }
    except Exception as exc:
        json.dump(
            {"ok": False, "error": {"type": type(exc).__name__, "message": str(exc)}},
            sys.stdout,
        )
        return 2

    json.dump({"ok": True, "value": {**value, "runtime": runtime}}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
