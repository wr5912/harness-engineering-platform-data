"""不可加载的合成 checkpoint 字节，仅供本地来源合同测试。"""
import hashlib
import json
from pathlib import Path


def make_snapshot(parent, config_path, init_from):
    parent = Path(parent)
    root = parent / "local-checkpoint"
    root.mkdir()
    files = {"head.pt": b"synthetic-head-not-a-torch-checkpoint\n",
             "adapter_model.safetensors": b"synthetic-weights-not-a-safetensors-file\n",
             "adapter_config.json": b'{"synthetic":true}\n',
             "training_config.json": Path(config_path).read_bytes()}
    entries = []
    for name, raw in files.items():
        (root / name).write_bytes(raw)
        entry = {"rfilename": name, "size": len(raw)}
        if name in ("head.pt", "adapter_model.safetensors"):
            entry["lfs"] = {"sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)}
        else:
            entry["blobId"] = hashlib.sha1(("blob " + str(len(raw)) + "\0").encode() + raw).hexdigest()
        entries.append(entry)
    repo, revision = init_from.split("@")
    metadata = parent / "repository-metadata.json"
    metadata.write_text(json.dumps({"id": repo, "sha": revision, "siblings": entries}) + "\n")
    return {"path": str(root), "repository_metadata_path": str(metadata),
            "repository_metadata_sha256": hashlib.sha256(metadata.read_bytes()).hexdigest()}
