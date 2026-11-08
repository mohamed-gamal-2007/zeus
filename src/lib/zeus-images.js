/**
 * ZEUS artwork, served from public/zeus/.
 *
 * `withImageFallback` is an <img onError> handler: if an asset fails to load it
 * swaps in the Z mark once, and hides the image if that also fails (rather than
 * looping forever on a broken src).
 */
const BASE = "/zeus";

export const ZEUS_IMAGES = {
  // Full "ZEUS — Learn. Grow. Achieve." wordmark
  logoFull: `${BASE}/53ce332f9_FIULL_LOGO-removebg-preview.png`,
  // Yellow Z mark
  logoIcon: `${BASE}/23acdfe46_Screenshot_2026-08-24_042358-removebg-preview.png`,
  // Square portrait used in circular avatars (object-cover object-top)
  avatar: `${BASE}/02325ee37_generated_image.jpg`,
  // Transparent robot, shown on the splash screen (object-contain)
  splash: `${BASE}/d926a568e_image-removebg-preview1.png`,
  // Landing hero banner
  hero: `${BASE}/636863135_generated_image.jpg`,
  // Celebrating robot for quiz milestones
  celebrate: `${BASE}/2e0bfccdc_generated_image.jpg`,
};

export function withImageFallback(event) {
  const img = event?.currentTarget || event?.target;
  if (!img || !img.dataset) return;
  if (img.dataset.zeusFallback === "1") {
    img.style.visibility = "hidden";
    return;
  }
  img.dataset.zeusFallback = "1";
  img.src = ZEUS_IMAGES.logoIcon;
}

export default ZEUS_IMAGES;
