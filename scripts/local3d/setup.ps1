# Installs the free, offline image -> 3D engine (TripoSR on CPU) into <repo>\local3d.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts\local3d\setup.ps1
# Needs Python 3.10/3.11 and git. Downloads ~2.5GB (PyTorch CPU ~200MB, libraries, model ~1.7GB on first use).
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$l3d = Join-Path $root 'local3d'
New-Item -ItemType Directory -Force $l3d | Out-Null

$py = (Get-Command py -ErrorAction SilentlyContinue)
$python = if ($py) { 'py' } else { 'python' }
$pyArgs = if ($py) { @('-3.10') } else { @() }

$venvPy = Join-Path $l3d 'venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) {
  Write-Host 'Creating Python venv...'
  & $python @pyArgs -m venv (Join-Path $l3d 'venv')
}
& $venvPy -m pip install --upgrade pip -q
Write-Host 'Installing PyTorch (CPU)...'
& $venvPy -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu -q
Write-Host 'Installing libraries...'
& $venvPy -m pip install "numpy<2" omegaconf==2.3.0 einops==0.7.0 transformers==4.35.0 trimesh "rembg[cpu]" huggingface-hub xatlas==0.0.9 moderngl==5.10.0 PyMCubes fast-simplification Pillow -q

$tsr = Join-Path $l3d 'TripoSR'
if (-not (Test-Path $tsr)) {
  Write-Host 'Downloading TripoSR source...'
  git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR.git $tsr
}
Write-Host 'Done. The model weights (~1.7GB) download automatically on the first 3D generation.'
