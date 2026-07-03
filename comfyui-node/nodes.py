import os
import glob
import numpy as np
import torch
from PIL import Image

LOG = "[Fluid UI]"


def _find_latest(watch_folder, pattern="fluid_*"):
    """Find the most recently modified image in the watch folder."""
    if not watch_folder or not os.path.isdir(watch_folder):
        return None

    extensions = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
    candidates = []
    for ext in extensions:
        candidates.extend(glob.glob(os.path.join(watch_folder, pattern + ext)))

    if not candidates:
        for ext in extensions:
            candidates.extend(glob.glob(os.path.join(watch_folder, "*" + ext)))

    if not candidates:
        return None

    return max(candidates, key=os.path.getmtime)


# ── API route: lets the JS extension check for new files ────────────
try:
    from server import PromptServer
    from aiohttp import web

    @PromptServer.instance.routes.get("/fluid_ui/check")
    async def fluid_ui_check(request):
        folder = request.query.get("folder", "")
        pattern = request.query.get("pattern", "fluid_*")
        latest = _find_latest(folder, pattern)
        if latest:
            return web.json_response({
                "file": os.path.basename(latest),
                "mtime": os.path.getmtime(latest),
            })
        return web.json_response({"file": "", "mtime": 0})

    print(f"{LOG} Registered /fluid_ui/check route")
except Exception as e:
    print(f"{LOG} Could not register API route: {e}")


# ── Node class ──────────────────────────────────────────────────────
class FluidUIImageLoader:
    """
    Loads the most recent image from a Fluid UI watched folder.

    Install: copy this folder into ComfyUI/custom_nodes/fluid-ui-bridge/
    Usage:
      1. Set watch_folder to the same path configured in Fluid UI
      2. Toggle watch_enabled ON and set poll_interval
      3. The JS extension polls the folder and clicks Run when a new file appears
    """

    CATEGORY = "image/input"
    FUNCTION = "load_image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "watch_folder": ("STRING", {
                    "default": "",
                    "multiline": False,
                }),
                "watch_enabled": ("BOOLEAN", {
                    "default": False,
                }),
                "poll_interval": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.1,
                    "max": 60.0,
                    "step": 0.1,
                }),
                "pattern": ("STRING", {
                    "default": "fluid_*",
                    "multiline": False,
                }),
            },
        }

    @classmethod
    def IS_CHANGED(cls, watch_folder, watch_enabled, poll_interval,
                   pattern="fluid_*", **kwargs):
        if not watch_enabled or not watch_folder:
            return ""
        latest = _find_latest(watch_folder, pattern)
        if not latest:
            return ""
        return str(os.path.getmtime(latest))

    def load_image(self, watch_folder, watch_enabled, poll_interval,
                   pattern="fluid_*"):
        """Load the latest image from the watched folder."""

        filepath = _find_latest(watch_folder, pattern)

        if not filepath:
            print(f"{LOG} No images found in: {watch_folder}")
            return (torch.zeros(1, 64, 64, 3, dtype=torch.float32),)

        print(f"{LOG} Loading: {os.path.basename(filepath)}")

        img = Image.open(filepath).convert("RGB")
        np_img = np.array(img).astype(np.float32) / 255.0
        tensor = torch.from_numpy(np_img).unsqueeze(0)

        return (tensor,)
