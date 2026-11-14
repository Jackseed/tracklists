"""Builds the sources of the app icons and splash screens from the web icon.

Run from the repository root: python3 resources/make-sources.py
then `npm run mobile:assets` turns them into the iOS / Android images.
"""
from PIL import Image

GREEN = (0x69, 0xF0, 0xAE, 255)  # --tl-green
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)

disc = Image.open('src/assets/icons/icon-512x512.png').convert('RGBA')
alpha = disc.getchannel('A')


def drawn(color, size):
    """The disc's strokes in one colour, `size` pixels wide."""
    layer = Image.new('RGBA', disc.size, color)
    layer.putalpha(alpha)
    return layer.resize((size, size), Image.LANCZOS)


def canvas(side, background, color, scale):
    image = Image.new('RGBA', (side, side), background)
    size = round(side * scale)
    offset = (side - size) // 2
    image.alpha_composite(drawn(color, size), (offset, offset))
    return image


# Icons: black disc on the brand green. Android's adaptive icon crops the
# foreground to its centre, hence the smaller disc there.
canvas(1024, GREEN, BLACK, 0.62).convert('RGB').save('resources/icon-only.png')
canvas(1024, (0, 0, 0, 0), BLACK, 0.42).save('resources/icon-foreground.png')
Image.new('RGB', (1024, 1024), GREEN[:3]).save('resources/icon-background.png')
# Splash: white disc on the app's black background.
for name in ('splash.png', 'splash-dark.png'):
    canvas(2732, BLACK, WHITE, 0.16).convert('RGB').save(f'resources/{name}')
