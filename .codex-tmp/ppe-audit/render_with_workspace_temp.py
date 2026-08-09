import runpy
import sys
import tempfile
from pathlib import Path


workspace_temp = Path(__file__).resolve().parent / "renderer-temp"
workspace_temp.mkdir(parents=True, exist_ok=True)
tempfile.tempdir = str(workspace_temp)

renderer = sys.argv[1]
sys.argv = [renderer, *sys.argv[2:]]
runpy.run_path(renderer, run_name="__main__")
