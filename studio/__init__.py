"""ZekerFlex Video Studio — agent-gedreven videoproductie in Python.

    from studio import Director
    Director("maak een 60s Pixar-achtige film over een eenzame banaan").run()
"""
from .director import Director
from .config import CAPS

__all__ = ["Director", "CAPS"]
