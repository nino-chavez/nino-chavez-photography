// Original gallery photographs from the photo-strip comparison selected by Nino, 2026-10-26.
export interface PortfolioPhoto {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export const portfolio: readonly PortfolioPhoto[] = [
  {
    "src": "/images/hero/flickday/triptych/t-14.webp",
    "alt": "A volleyball player standing beneath a blue tournament banner",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-15.webp",
    "alt": "A player in black jumping toward a volleyball on an indoor court",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-16.webp",
    "alt": "A player in a red top passing a yellow volleyball on sand",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-17.webp",
    "alt": "A player jumping with an arm extended on a grass court",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-19.webp",
    "alt": "Two people in shallow water beneath a pier, in black and white",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-20.webp",
    "alt": "An indoor volleyball attack facing three players at the net",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-22.webp",
    "alt": "A player in red reaching overhead toward a volleyball",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-23.webp",
    "alt": "A player on grass reaching toward a yellow volleyball",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-24.webp",
    "alt": "Light falling across large raised lettering on a wall",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-25.webp",
    "alt": "An indoor volleyball attack meeting raised hands at the net",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-27.webp",
    "alt": "A player crouching on a grass court, in black and white",
    "width": 900,
    "height": 1351
  },
  {
    "src": "/images/hero/flickday/triptych/t-28.webp",
    "alt": "A player in black airborne beside an indoor volleyball net",
    "width": 900,
    "height": 1351
  }
];

const landscapes: readonly PortfolioPhoto[] = [
  {
    "src": "/images/hero/flickday/fd-38.webp",
    "alt": "A volleyball player balancing on one hand beneath the ball",
    "width": 1920,
    "height": 1280
  },
  {
    "src": "/images/hero/flickday/fd-12.webp",
    "alt": "Volleyball players celebrating together near the net",
    "width": 1920,
    "height": 1280
  }
];

// Base sequence: whole frames, with landscapes included on wider screens.
export const photoStrip: readonly PortfolioPhoto[] = [
  landscapes[0], ...portfolio.slice(0, 3), landscapes[1], ...portfolio.slice(3)
];

export function rotatePortfolio(photos: readonly PortfolioPhoto[], start: number): readonly PortfolioPhoto[] {
  const index = Math.floor(start * photos.length);
  return [...photos.slice(index), ...photos.slice(0, index)];
}
