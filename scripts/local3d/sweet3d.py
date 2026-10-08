"""Image -> textured 3D model (.glb) on this PC with TripoSR (CPU). 100% free and offline after setup.

Usage: python sweet3d.py <image> <out.glb> [--mc 256] [--tex 1024] [--fg 0.85]
Prints one JSON object per line: {"step": "..."} progress, then {"done": ...} or {"error": ...}.
Runtime files live in <repo>/local3d (venv, TripoSR source, model weights) — see setup.ps1.
"""
import argparse
import json
import os
import sys
import time
import types

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
L3D = os.path.join(ROOT, "local3d")
os.environ.setdefault("HF_HOME", os.path.join(L3D, "hf"))
os.environ.setdefault("U2NET_HOME", os.path.join(L3D, "u2net"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
sys.path.insert(0, os.path.join(L3D, "TripoSR"))


def emit(**kw):
    print(json.dumps(kw), flush=True)  # ASCII-escaped so Thai survives any Windows console code page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("out")
    ap.add_argument("--mc", type=int, default=256, help="marching cubes resolution (detail)")
    ap.add_argument("--tex", type=int, default=1024, help="texture size")
    ap.add_argument("--fg", type=float, default=0.85, help="foreground ratio after background removal")
    ap.add_argument("--max-tris", type=int, default=19000, help="Roblox limit is ~20k triangles per mesh")
    ap.add_argument("--smooth", type=int, default=12, help="Taubin smoothing iterations (0 = off)")
    args = ap.parse_args()
    t0 = time.time()

    import numpy as np
    import torch
    import mcubes

    # TripoSR expects torchmcubes (needs a C++ compiler on Windows); PyMCubes has wheels, so shim it.
    def marching_cubes(vol, thr):
        v, f = mcubes.marching_cubes(vol.detach().cpu().numpy(), thr)
        v = v[:, [2, 1, 0]]  # torchmcubes returns z,y,x; TripoSR swaps back to x,y,z
        return torch.from_numpy(np.ascontiguousarray(v, dtype=np.float32)), torch.from_numpy(f.astype(np.int64))

    sys.modules["torchmcubes"] = types.SimpleNamespace(marching_cubes=marching_cubes)

    import rembg
    import trimesh
    from PIL import Image
    from tsr.bake_texture import bake_texture
    from tsr.system import TSR
    from tsr.utils import remove_background, resize_foreground

    torch.set_num_threads(max(1, os.cpu_count() or 1))

    emit(step="โหลดโมเดล AI (ครั้งแรกจะดาวน์โหลด ~1.7GB)…")
    model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(8192)
    model.to("cpu")

    emit(step="ลบพื้นหลังรูป…")
    img = remove_background(Image.open(args.image), rembg.new_session())
    img = resize_foreground(img, args.fg)
    arr = np.array(img).astype(np.float32) / 255.0
    arr = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5
    img = Image.fromarray((arr * 255.0).astype(np.uint8))

    emit(step="AI กำลังสร้างรูปทรง 3D (CPU)…")
    with torch.no_grad():
        codes = model([img], device="cpu")

    emit(step="สร้างผิวโมเดล…")
    meshes = model.extract_mesh(codes, False, resolution=args.mc)
    # Smooth the marching-cubes surface a little (keeps volume) so it doesn't look lumpy once simplified.
    trimesh.smoothing.filter_taubin(meshes[0], lamb=0.5, nu=-0.53, iterations=args.smooth)
    # Roblox meshes are limited to ~20k triangles: simplify BEFORE baking so the texture still fits the final mesh.
    if len(meshes[0].faces) > args.max_tris:
        emit(step=f"ลดจำนวนสามเหลี่ยม {len(meshes[0].faces):,} → {args.max_tris:,} ให้ Roblox รับได้…")
        meshes[0] = meshes[0].simplify_quadric_decimation(face_count=args.max_tris)

    emit(step="วาดลายลงโมเดล…")
    b = bake_texture(meshes[0], model, codes[0], args.tex)
    verts = meshes[0].vertices[b["vmapping"]]
    tex = Image.fromarray((b["colors"] * 255.0).astype(np.uint8)).transpose(Image.FLIP_TOP_BOTTOM)
    mesh = trimesh.Trimesh(
        vertices=verts,
        faces=b["indices"],
        # Matte, non-metallic material so the texture shows its real colours (default exports look dark/metallic).
        visual=trimesh.visual.TextureVisuals(
            uv=b["uvs"],
            material=trimesh.visual.material.PBRMaterial(baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.9),
        ),
        process=False,
    )
    # TripoSR is Z-up; Roblox/glTF are Y-up.
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    mesh.export(args.out)
    ext = mesh.extents.tolist()
    emit(done=args.out, seconds=round(time.time() - t0, 1), triangles=int(len(mesh.faces)), extents=ext)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # report to the Node side as JSON
        emit(error=f"{type(e).__name__}: {e}")
        sys.exit(1)
