from .nodes import FluidUIImageLoader

NODE_CLASS_MAPPINGS = {
    "FluidUIImageLoader": FluidUIImageLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FluidUIImageLoader": "A Small Good Thing Image Loader",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
