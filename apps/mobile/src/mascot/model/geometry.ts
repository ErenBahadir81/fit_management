/**
 * Pure geometry for Floo. Plain functions of numbers, every one a worklet, so the silhouette is
 * rebuilt from scratch on the UI thread every frame without a round trip.
 *
 * Coordinate space: 200 × 240, origin top-left, y down. Base circle centred on (100, 158), r 62.
 *
 * The silhouette is NOT eyeballed. `LEFT_FLANK` / `RIGHT_FLANK` are points traced off the approved
 * reference art (see `reference-contour.json`), and the curve through them is a Catmull-Rom spline
 * converted to cubics, which stays within 1.5 units of the trace everywhere. The only place it
 * deliberately departs is the apex, rounded to ~2.5 units so the tip is a soft point rather than a
 * needle. Guessing at bezier handles is what produced every rejected version of this character.
 */

export const BODY = { cx: 100, cy: 158, r: 62 } as const;
/** The base is NOT a circle: measured off the reference the flanks peak at y=158 with rx 62, but
 *  the underside reaches y≈223.4 — ry 65.4. The bottom arc is elliptical for exactly that. */
export const BODY_RY = 65.4;
/** Underside of the body. Legs emerge from behind it. */
export const GROUND_Y = 220;
/** The soles. Lean pivots here, not at the body, now that the character stands on feet. */
export const FOOT_Y = 262.6;
/** Contact shadow, measured off the reference. */
export const SHADOW = { x: 96.8, y: 272.3, rx: 66, ry: 11.5 } as const;
/** Clip rectangles for the two lower rim shades. */
export const LOWER_LEFT_RECT = "M0 120H100V240H0Z";
export const LOWER_RIGHT_RECT = "M100 120H200V240H100Z";
/** Where each limb hinges, so rotation params swing them from the right place. */
export const SHOULDER_L = { x: 40, y: 180 } as const;
export const HIP_L = { x: 85, y: 218 } as const;

/**
 * The four limbs, traced pixel-by-pixel off the reference (`reference-limb-paths.json`) and
 * smoothed with a closed Catmull-Rom at tension 0.5 — enough to lose the pixel staircase, not
 * enough to lose the fingers, the thumb or the toe of the shoe.
 *
 * These are NOT hand-authored. Every attempt to construct an arm from a centreline and a palm
 * produced boxy gloves and arms bowing the wrong way; the trace does not.
 *
 * They are drawn BEHIND the body. The trace keeps ≥ 4 units clear of the body edge and its
 * attachment vertices are pushed ~6 units under the body, so the joins close behind it and no
 * sliver can peek out beside the contour. Below y = 267 the trace is shadow bleed, clipped away.
 */
export const ARM_PATH_L =
  "M45.5 191.8C45.2 192.8 45.1 192.1 44.8 193.0C44.5 193.9 44.0 195.4 43.7 197.2C43.3 198.9 42.9 201.2 42.6 203.6C42.4 206.0 42.1 209.7 42.1 211.4C42.1 213.1 42.1 212.7 42.5 213.5C43.0 214.3 44.3 215.3 44.8 216.1C45.4 216.9 45.7 217.1 46.1 218.4C46.6 219.7 46.8 222.1 47.5 223.9C48.3 225.6 49.9 227.5 50.4 228.7C50.9 229.9 50.7 230.2 50.5 230.9C50.4 231.6 50.2 232.4 49.7 232.8C49.2 233.3 48.4 233.6 47.7 233.7C47.0 233.8 46.5 233.7 45.6 233.4C44.6 233.1 42.8 231.9 42.1 231.7C41.4 231.4 41.4 231.2 41.3 231.8C41.1 232.4 41.1 233.7 41.4 235.3C41.7 236.8 42.8 239.8 43.0 241.1C43.2 242.5 43.0 242.6 42.8 243.3C42.6 244.0 42.1 244.7 41.7 245.1C41.2 245.5 40.6 245.7 40.1 245.8C39.6 246.0 39.3 246.0 38.8 246.0C38.3 245.9 37.7 245.9 37.1 245.6C36.5 245.4 36.2 244.7 35.3 244.4C34.4 244.1 33.1 244.8 31.4 243.9C29.8 243.0 26.8 240.0 25.5 238.8C24.3 237.7 24.6 237.8 24.2 237.1C23.8 236.5 23.5 235.9 23.3 234.7C23.0 233.5 22.7 231.2 22.6 230.0C22.5 228.7 22.4 229.0 22.6 227.3C22.8 225.7 23.2 222.5 24.0 220.1C24.8 217.7 26.6 216.2 27.3 213.0C28.1 209.9 28.1 204.7 28.7 201.4C29.2 198.1 29.9 195.6 30.5 193.3C31.1 191.1 31.6 189.8 32.2 187.9C32.9 186.1 33.4 184.5 34.4 182.3C35.4 180.0 37.7 175.8 38.4 174.5C39.1 173.2 38.0 173.9 38.7 174.4C39.4 174.8 41.2 175.2 42.4 177.3C43.7 179.5 45.7 184.7 46.2 187.1C46.7 189.5 45.7 190.8 45.5 191.8Z";
export const ARM_PATH_R =
  "M161.4 174.2C162.6 174.6 163.6 178.2 164.4 179.9C165.2 181.6 165.4 182.0 166.2 184.4C167.1 186.7 168.5 190.8 169.3 193.9C170.2 196.9 170.8 199.5 171.3 202.8C171.8 206.0 171.8 210.6 172.4 213.1C173.0 215.6 174.3 216.5 174.9 217.7C175.5 218.9 175.6 219.6 175.9 220.6C176.2 221.5 176.4 222.2 176.6 223.5C176.8 224.9 177.1 226.9 177.0 228.7C177.0 230.5 176.6 233.0 176.4 234.3C176.1 235.7 175.9 236.0 175.6 236.8C175.2 237.6 174.8 238.3 174.1 239.0C173.5 239.6 172.5 239.9 171.6 240.7C170.8 241.4 169.7 243.0 169.0 243.6C168.3 244.2 168.2 244.0 167.4 244.2C166.6 244.4 165.2 244.3 164.4 244.6C163.5 244.8 162.8 245.6 162.1 245.9C161.5 246.1 161.0 246.0 160.4 246.0C159.8 245.9 159.2 245.8 158.7 245.6C158.3 245.4 158.0 245.1 157.8 244.8C157.5 244.4 157.3 244.1 157.2 243.6C157.0 243.1 156.8 242.6 156.8 241.9C156.8 241.2 156.9 240.5 157.1 239.3C157.3 238.1 158.1 235.9 158.3 234.7C158.5 233.5 158.4 232.6 158.3 232.1C158.1 231.6 158.3 231.4 157.6 231.6C156.9 231.9 155.1 233.1 154.1 233.4C153.1 233.7 152.2 233.7 151.6 233.6C150.9 233.5 150.4 233.0 150.0 232.8C149.7 232.6 149.6 232.4 149.5 232.1C149.3 231.9 149.2 231.8 149.1 231.3C149.1 230.9 148.9 230.2 149.1 229.6C149.2 229.0 149.3 228.4 149.8 227.6C150.2 226.7 151.2 225.9 151.7 224.7C152.3 223.5 152.6 221.5 153.1 220.1C153.5 218.8 154.0 217.6 154.6 216.5C155.3 215.5 156.4 214.6 156.9 213.9C157.4 213.3 157.4 214.1 157.5 212.8C157.6 211.5 157.5 208.4 157.4 206.3C157.2 204.1 156.8 201.5 156.6 199.8C156.3 198.1 156.2 197.3 155.8 196.0C155.4 194.7 154.6 193.4 154.2 192.0C153.9 190.6 153.0 190.1 153.6 187.7C154.2 185.2 156.4 179.4 157.7 177.1C159.0 174.9 160.3 173.7 161.4 174.2Z";
export const LEG_PATH_L =
  "M90.8 224.0C91.7 228.5 92.0 240.7 92.6 247.1C93.2 253.5 94.2 259.4 94.4 262.4C94.7 265.4 94.2 264.4 94.1 265.1C93.9 265.7 93.9 265.9 93.5 266.5C93.0 267.0 92.5 267.8 91.6 268.4C90.7 269.0 89.7 269.6 88.2 270.2C86.8 270.9 84.7 271.7 82.8 272.2C81.0 272.7 78.7 273.1 77.2 273.3C75.6 273.6 75.1 273.8 73.3 273.8C71.6 273.8 68.4 273.6 66.8 273.4C65.1 273.1 64.3 272.8 63.4 272.5C62.5 272.2 61.8 271.8 61.3 271.5C60.9 271.2 60.7 271.1 60.5 270.7C60.2 270.4 59.9 270.3 59.7 269.4C59.6 268.5 59.1 266.9 59.5 265.6C59.9 264.3 61.1 262.7 61.9 261.6C62.7 260.6 63.4 260.0 64.1 259.4C64.7 258.8 64.9 258.7 65.9 258.1C66.9 257.5 68.3 256.7 70.0 255.9C71.7 255.2 75.0 254.2 76.2 253.7C77.4 253.2 76.9 253.3 77.2 253.1C77.4 252.9 77.4 252.8 77.6 252.4C77.7 252.1 77.9 252.3 78.0 250.9C78.1 249.5 78.3 249.1 78.2 244.0C78.1 238.9 76.6 224.6 77.4 220.5C78.1 216.3 81.2 219.1 82.8 219.1C84.4 219.1 85.5 219.5 86.9 220.3C88.2 221.1 89.8 219.6 90.8 224.0Z";
export const LEG_PATH_R =
  "M122.2 220.6C123.1 221.1 122.4 221.1 122.4 222.1C122.4 223.1 122.1 221.6 122.0 226.7C121.9 231.8 121.5 248.1 121.7 252.6C121.9 257.1 121.8 253.2 123.2 253.7C124.6 254.3 128.1 255.2 130.1 256.1C132.2 257.0 134.1 258.0 135.5 259.1C136.9 260.2 137.8 261.5 138.6 262.6C139.4 263.6 139.8 264.9 140.1 265.7C140.4 266.4 140.3 266.7 140.3 267.2C140.3 267.7 140.3 268.2 140.1 268.7C140.0 269.3 139.7 270.0 139.4 270.5C139.1 271.0 138.7 271.2 138.3 271.6C137.8 271.9 137.4 272.2 136.6 272.5C135.8 272.8 134.8 273.1 133.6 273.3C132.4 273.5 130.7 273.7 129.4 273.8C128.0 273.8 126.9 273.7 125.5 273.6C124.1 273.4 122.9 273.3 120.9 272.9C119.0 272.5 115.9 271.9 113.8 271.2C111.7 270.6 109.6 269.5 108.5 268.9C107.3 268.4 107.4 268.2 106.9 267.8C106.5 267.4 106.2 267.2 105.9 266.6C105.6 266.1 105.4 265.4 105.2 264.4C105.1 263.5 105.0 263.5 105.2 261.0C105.5 258.4 106.2 255.2 106.9 249.1C107.5 243.0 108.0 228.9 109.0 224.1C110.0 219.3 111.5 221.1 112.9 220.3C114.2 219.5 115.4 219.2 117.0 219.2C118.5 219.2 121.3 220.1 122.2 220.6Z";

/** The soles bottom out at y≈274.4 in the reference (measured); clip just below that. */
export const LIMB_CLIP = "M0 0H200V275.4H0Z";
/** The shoe is simply the part of the leg polygon below the ankle. */
export const SHOE_CLIP = "M0 252H200V275.4H0Z";


/**
 * Limb interior detail, extracted from the reference the same way the silhouettes were: the
 * `*_RIM_*` paths are the bright specular band the reference paints just inside the outer edge of
 * every limb (sampled #94DAF9), and the `*_CREASE_*` paths are the darker separation lines —
 * finger and toe splits, the boot cuff (sampled #4383B1). Both are filled, not stroked, because
 * the reference's line weight varies along each stroke and a constant-width stroke reads wrong.
 * They are clipped to their limb so a rotated limb never leaks detail past its own contour.
 */
export const ARM_RIM_L =
  "M24.9 229.6C24.7 229.6 24.6 229.7 24.6 229.2C24.5 228.8 24.5 228.3 24.7 227.1C24.9 225.9 25.1 223.6 25.6 221.9C26.1 220.2 26.8 218.2 27.4 216.9C28.0 215.5 28.8 215.7 29.3 213.7C29.7 211.6 29.7 207.9 30.3 204.7C30.8 201.4 31.7 197.3 32.5 194.2C33.3 191.2 34.2 188.6 35.2 186.2C36.1 183.8 37.4 181.0 38.0 179.8C38.5 178.6 38.5 179.1 38.6 179.0C38.8 179.0 38.9 179.3 38.9 179.4C39.0 179.5 39.5 178.1 38.8 179.9C38.2 181.8 36.0 187.6 35.1 190.5C34.2 193.3 34.1 194.4 33.5 197.2C32.9 200.0 32.0 204.2 31.6 207.1C31.1 210.0 31.3 212.8 30.8 214.5C30.3 216.3 29.4 216.6 28.7 217.6C28.1 218.7 27.6 219.7 27.1 221.0C26.6 222.3 26.1 224.2 25.8 225.6C25.4 226.9 25.3 228.6 25.2 229.2C25.0 229.9 25.0 229.6 24.9 229.6Z";
export const ARM_RIM_R =
  "M174.9 229.0C174.8 229.0 174.9 229.7 174.6 228.7C174.4 227.7 173.7 224.3 173.4 223.0C173.1 221.7 172.9 221.6 172.6 220.8C172.2 219.9 171.9 219.2 171.3 218.1C170.7 217.1 169.7 217.2 169.0 214.4C168.3 211.7 167.8 204.9 167.3 201.5C166.7 198.1 166.3 196.8 165.6 193.9C164.8 191.1 163.3 186.0 162.8 184.2C162.4 182.4 162.7 183.4 162.8 183.2C162.8 183.0 162.9 182.9 163.0 182.8C163.2 182.8 163.1 182.3 163.5 183.0C163.8 183.7 164.4 185.0 165.1 187.1C165.8 189.1 166.9 192.7 167.6 195.4C168.4 198.1 168.8 200.4 169.3 203.5C169.8 206.6 170.2 211.8 170.7 214.0C171.3 216.2 171.9 215.7 172.5 216.9C173.0 218.1 173.7 220.0 174.1 221.4C174.5 222.9 174.7 224.5 174.9 225.7C175.1 226.9 175.1 228.1 175.1 228.6C175.1 229.2 175.0 229.0 174.9 229.0Z";
export const LEG_RIM_L =
  "M61.9 268.7C61.7 269.0 61.6 268.6 61.5 268.4C61.4 268.2 61.3 268.0 61.4 267.4C61.5 266.8 61.6 265.8 62.0 264.9C62.4 264.0 63.4 262.7 64.0 262.0C64.6 261.3 64.8 261.2 65.5 260.7C66.2 260.2 67.2 259.5 68.1 259.0C68.9 258.5 69.1 258.3 70.8 257.6C72.5 257.0 77.0 255.6 78.5 255.0C79.9 254.4 79.3 255.0 79.5 254.0C79.8 253.1 80.0 252.7 80.1 249.5C80.1 246.3 79.7 238.2 79.7 234.8C79.6 231.4 79.8 230.1 79.9 229.2C79.9 228.3 80.1 229.2 80.2 229.5C80.3 229.8 80.2 228.3 80.4 231.0C80.7 233.7 81.5 242.0 81.7 245.6C82.0 249.3 81.8 251.3 81.8 252.8C81.7 254.2 81.6 253.8 81.4 254.2C81.2 254.7 81.0 255.1 80.5 255.4C80.1 255.8 80.6 255.9 78.8 256.5C77.1 257.2 72.1 258.5 70.1 259.2C68.1 260.0 67.9 260.3 67.0 260.9C66.1 261.5 65.2 262.4 64.7 262.9C64.2 263.4 64.2 263.5 63.8 264.2C63.4 264.8 62.6 266.0 62.3 266.8C62.0 267.6 62.0 268.5 61.9 268.7ZM67.2 264.8C66.6 264.9 66.6 264.7 66.4 264.6C66.3 264.4 66.1 264.1 66.1 263.8C66.1 263.5 66.1 263.2 66.3 262.8C66.6 262.5 66.7 262.2 67.4 261.8C68.1 261.3 69.7 260.6 70.4 260.3C71.2 260.0 71.5 260.0 71.9 260.1C72.3 260.1 72.4 260.2 72.6 260.5C72.7 260.7 72.9 261.2 72.8 261.6C72.7 262.0 72.3 262.4 71.9 262.8C71.4 263.2 70.7 263.8 69.9 264.1C69.2 264.4 67.8 264.7 67.2 264.8Z";
export const LEG_RIM_R =
  "M138.1 268.5C137.8 268.4 137.3 266.6 136.9 265.8C136.6 265.0 136.4 264.6 135.7 263.7C135.0 262.8 133.7 261.3 132.5 260.5C131.3 259.6 130.4 259.3 128.5 258.6C126.5 257.9 122.3 256.9 120.8 256.4C119.2 255.9 119.4 255.7 119.0 255.5C118.6 255.2 118.6 255.1 118.4 254.7C118.2 254.2 118.0 253.9 117.9 252.7C117.8 251.6 117.6 251.1 117.9 247.7C118.1 244.3 119.0 235.2 119.3 232.2C119.5 229.3 119.4 230.6 119.6 230.3C119.7 229.9 119.8 229.8 119.9 229.9C120.0 230.0 120.2 227.3 120.1 230.9C120.1 234.4 119.6 247.5 119.6 251.4C119.5 255.3 119.8 253.8 120.1 254.4C120.3 254.9 119.4 254.4 120.8 254.9C122.2 255.4 126.7 256.7 128.5 257.3C130.2 258.0 130.3 258.1 131.2 258.6C132.1 259.2 133.3 260.0 134.1 260.6C134.9 261.2 135.4 261.5 136.0 262.2C136.6 262.9 137.3 264.0 137.7 264.7C138.1 265.4 138.2 266.0 138.3 266.6C138.3 267.2 138.3 268.7 138.1 268.5ZM132.6 264.8C132.2 264.9 131.7 265.0 130.9 264.6C130.0 264.3 128.3 263.4 127.6 262.9C126.8 262.3 126.7 261.8 126.5 261.4C126.4 261.0 126.5 260.6 126.7 260.4C126.9 260.1 127.2 260.0 127.5 260.0C127.9 260.0 128.1 259.8 128.9 260.1C129.6 260.4 131.3 261.2 132.0 261.6C132.7 262.1 132.8 262.3 133.0 262.7C133.2 263.0 133.3 263.2 133.3 263.5C133.4 263.8 133.4 264.1 133.2 264.3C133.1 264.5 133.0 264.8 132.6 264.8Z";
export const ARM_CREASE_L =
  "M30.3 202.6C30.2 202.8 30.1 202.4 30.0 202.2C30.0 202.0 30.1 201.6 30.1 201.2C30.1 200.9 30.2 200.5 30.3 200.3C30.4 200.1 30.6 200.0 30.6 200.1C30.7 200.1 30.9 200.4 30.8 200.8C30.7 201.2 30.4 202.3 30.3 202.6ZM39.6 232.4C39.4 232.6 39.2 232.4 39.2 231.7C39.2 230.9 39.4 228.9 39.5 228.0C39.7 227.1 39.8 226.7 40.0 226.3C40.2 226.0 40.1 225.3 40.6 225.9C41.2 226.6 43.0 229.4 43.4 230.1C43.8 230.9 43.5 230.4 43.1 230.4C42.8 230.4 41.7 230.3 41.3 230.3C40.8 230.3 40.6 230.2 40.3 230.5C40.0 230.9 39.7 232.2 39.6 232.4ZM29.4 239.6C29.0 239.5 27.7 238.7 27.2 238.4C26.8 238.0 26.9 238.6 26.8 237.5C26.7 236.5 26.7 233.5 26.8 232.3C26.8 231.1 27.0 230.7 27.1 230.3C27.3 229.8 27.4 229.7 27.5 229.7C27.6 229.7 27.7 229.1 27.9 230.3C28.1 231.4 28.5 234.9 28.8 236.4C29.1 237.9 29.4 238.5 29.5 239.0C29.6 239.6 29.7 239.7 29.4 239.6ZM36.1 243.0C35.8 243.1 34.7 243.0 34.4 242.9C34.0 242.9 34.2 243.4 33.9 242.7C33.6 242.0 32.8 239.7 32.6 238.6C32.3 237.6 32.3 237.5 32.2 236.6C32.2 235.7 32.2 234.3 32.2 233.4C32.3 232.6 32.5 231.7 32.6 231.3C32.7 230.8 32.8 230.8 32.9 230.9C33.0 230.9 33.0 230.0 33.3 231.3C33.6 232.6 34.2 236.8 34.6 238.6C35.1 240.5 35.9 241.7 36.2 242.4C36.5 243.1 36.5 242.9 36.1 243.0Z";
export const ARM_CREASE_R =
  "M156.9 194.1C156.8 194.1 156.3 193.3 156.2 192.8C156.1 192.3 155.7 192.6 156.2 191.3C156.7 189.9 158.4 186.7 159.2 184.8C160.0 182.8 160.7 180.6 161.1 179.6C161.4 178.6 161.4 178.9 161.5 178.7C161.7 178.5 161.8 178.3 162.0 178.5C162.1 178.7 162.4 179.2 162.4 179.9C162.4 180.6 162.3 181.8 162.1 182.7C162.0 183.5 162.0 183.6 161.5 184.8C161.1 186.0 159.9 188.4 159.2 189.7C158.5 191.0 157.8 191.9 157.4 192.6C157.0 193.3 157.1 194.0 156.9 194.1ZM158.9 214.5C158.8 214.5 158.6 214.6 158.6 214.2C158.6 213.7 158.8 212.2 158.9 211.7C159.0 211.2 159.1 211.2 159.2 211.2C159.3 211.2 159.4 211.3 159.4 211.7C159.5 212.0 159.5 212.9 159.4 213.4C159.4 213.8 159.3 214.1 159.2 214.3C159.1 214.5 159.0 214.5 158.9 214.5ZM160.0 234.7C159.9 234.7 159.7 234.7 159.7 234.2C159.6 233.7 159.7 232.5 159.6 232.0C159.6 231.4 159.5 231.2 159.3 230.9C159.2 230.7 159.1 230.5 158.7 230.4C158.3 230.3 157.3 230.3 157.0 230.3C156.6 230.2 156.3 230.6 156.6 230.0C156.8 229.3 158.2 227.0 158.7 226.3C159.1 225.6 159.0 225.9 159.2 225.9C159.3 225.9 159.6 226.0 159.7 226.1C159.9 226.3 159.9 226.2 160.0 226.9C160.2 227.7 160.5 229.5 160.6 230.6C160.6 231.8 160.4 233.4 160.3 234.0C160.2 234.7 160.1 234.7 160.0 234.7ZM170.6 239.5C170.3 239.5 170.2 239.4 170.3 238.8C170.4 238.3 170.8 237.5 171.1 236.0C171.3 234.5 171.7 231.1 171.8 230.1C172.0 229.0 172.1 229.5 172.2 229.6C172.4 229.6 172.6 230.0 172.7 230.6C172.9 231.1 173.0 231.5 173.1 232.7C173.1 233.9 173.0 236.9 172.9 237.8C172.8 238.8 172.8 238.2 172.4 238.5C172.0 238.8 170.9 239.4 170.6 239.5ZM165.6 243.1C165.2 243.4 164.3 243.2 163.9 243.1C163.6 243.0 163.3 243.4 163.5 242.6C163.7 241.9 164.7 240.4 165.2 238.5C165.6 236.6 166.1 232.5 166.4 231.2C166.7 229.9 166.6 230.7 166.8 230.7C166.9 230.6 167.1 230.8 167.2 231.2C167.3 231.5 167.4 231.6 167.5 232.5C167.5 233.4 167.7 235.1 167.6 236.4C167.4 237.8 166.9 239.7 166.6 240.8C166.3 241.9 166.0 242.7 165.6 243.1Z";
export const LEG_CREASE_L =
  "M89.7 229.0C88.1 228.6 82.1 226.5 80.3 225.8C78.6 225.1 79.2 225.3 79.0 224.8C78.8 224.3 78.9 223.1 79.1 222.7C79.2 222.3 78.2 222.1 79.8 222.5C81.5 222.8 87.5 224.3 89.1 224.9C90.7 225.4 89.5 225.2 89.7 225.8C89.8 226.4 89.9 227.8 89.9 228.4C89.9 228.9 91.3 229.5 89.7 229.0ZM79.3 233.4C79.2 233.7 79.0 233.1 78.9 232.7C78.9 232.2 78.9 231.2 78.9 230.8C79.0 230.4 79.1 230.3 79.2 230.3C79.3 230.3 79.5 230.4 79.5 231.0C79.5 231.5 79.4 233.1 79.3 233.4ZM79.6 249.8C79.5 249.8 79.4 249.7 79.3 249.1C79.2 248.6 79.3 247.0 79.3 246.5C79.4 246.0 79.5 246.0 79.6 246.0C79.7 246.0 79.8 246.1 79.9 246.7C79.9 247.2 79.9 248.9 79.9 249.4C79.8 250.0 79.7 249.9 79.6 249.8ZM78.0 255.0C77.8 254.9 77.7 254.8 77.8 254.6C77.9 254.3 78.4 254.1 78.6 253.7C78.8 253.3 79.0 252.6 79.1 252.3C79.3 252.1 79.4 252.2 79.5 252.2C79.5 252.3 79.6 252.5 79.6 252.8C79.6 253.1 79.4 253.9 79.3 254.2C79.2 254.5 79.1 254.6 78.9 254.7C78.6 254.8 78.2 255.0 78.0 255.0Z";
export const LEG_CREASE_R =
  "M111.2 228.4C109.8 228.8 110.7 228.4 110.5 228.3C110.3 228.2 110.2 228.3 110.1 227.8C110.1 227.3 110.2 225.9 110.3 225.5C110.4 225.0 109.9 225.2 110.7 224.9C111.5 224.6 113.7 224.3 115.3 223.9C116.9 223.5 119.3 222.7 120.2 222.5C121.1 222.3 120.7 222.3 120.8 222.7C120.9 223.1 120.9 224.3 120.9 224.8C120.9 225.2 121.0 225.3 120.6 225.4C120.3 225.5 120.4 225.1 118.9 225.6C117.3 226.1 112.6 227.9 111.2 228.4ZM120.3 243.0C120.2 243.0 120.0 242.9 119.9 242.3C119.9 241.7 119.9 239.9 119.9 239.3C120.0 238.7 120.1 238.8 120.2 238.8C120.3 238.8 120.5 238.8 120.5 239.5C120.6 240.1 120.5 242.0 120.5 242.6C120.5 243.2 120.4 243.1 120.3 243.0ZM120.1 252.1C120.0 252.1 119.8 252.3 119.8 251.4C119.7 250.5 119.7 247.5 119.8 246.7C119.8 245.8 120.0 246.2 120.1 246.2C120.2 246.2 120.3 246.0 120.3 246.8C120.4 247.7 120.4 250.6 120.3 251.4C120.3 252.3 120.2 252.1 120.1 252.1Z";

/**
 * The arms' contour as an OPEN stroke. The closed fill path runs deep under the body so the arm
 * can be painted in front of it without a seam; stroking that closure would draw a line across
 * the body that the reference does not have. These stop ~4 units inside the body edge instead,
 * so the armpit line tapers out under the contour exactly as the reference draws it.
 */
export const ARM_LINE_L =
  "M47.6 188.4C47.7 188.7 48.8 189.3 48.4 190.0C48.0 190.6 45.9 191.1 45.1 192.3C44.3 193.4 44.1 195.2 43.7 197.1C43.3 198.9 42.9 201.0 42.6 203.4C42.4 205.7 42.1 209.4 42.1 211.1C42.1 212.8 42.2 212.9 42.6 213.6C43.0 214.4 43.9 214.9 44.4 215.6C44.9 216.2 45.3 216.7 45.6 217.4C46.0 218.0 46.1 218.3 46.5 219.4C46.8 220.5 46.9 222.4 47.6 223.9C48.2 225.5 49.9 227.5 50.4 228.7C50.9 229.8 50.6 230.1 50.6 230.8C50.5 231.4 50.4 232.0 50.0 232.5C49.7 233.0 48.9 233.3 48.4 233.5C47.9 233.7 47.6 233.8 47.1 233.7C46.5 233.6 45.8 233.5 45.0 233.2C44.2 232.8 42.9 231.9 42.3 231.7C41.6 231.5 41.4 231.2 41.2 231.8C41.1 232.5 41.1 234.0 41.4 235.4C41.7 236.9 42.6 239.5 42.9 240.5C43.2 241.6 43.0 241.4 43.0 241.9C43.0 242.4 42.9 243.0 42.7 243.5C42.5 244.0 42.5 244.5 42.0 244.9C41.5 245.3 40.2 245.8 39.4 246.0C38.6 246.1 37.9 245.9 37.2 245.7C36.5 245.4 36.1 244.7 35.2 244.4C34.4 244.1 33.0 244.3 32.3 244.1C31.6 244.0 31.8 244.3 31.0 243.7C30.3 243.1 28.5 241.1 27.7 240.4C26.9 239.7 27.0 240.2 26.4 239.7C25.8 239.1 24.5 237.7 24.0 236.9C23.5 236.1 23.5 236.0 23.3 234.8C23.0 233.7 22.7 231.7 22.6 230.0C22.6 228.3 22.8 226.0 23.0 224.4C23.2 222.7 23.3 221.8 24.0 219.9C24.8 218.0 26.6 216.0 27.4 212.9C28.2 209.8 28.1 204.7 28.7 201.5C29.2 198.3 29.9 195.7 30.5 193.5C31.1 191.2 31.5 189.9 32.2 188.0C32.9 186.1 33.5 184.2 34.5 182.0C35.5 179.8 37.1 176.0 38.4 174.5C39.6 173.1 41.3 173.3 42.0 173.4C42.7 173.5 42.3 174.9 42.4 175.2";
export const ARM_LINE_R =
  "M157.6 175.1C157.7 174.8 157.4 173.4 158.1 173.3C158.7 173.1 160.4 173.1 161.4 174.2C162.5 175.3 163.6 178.2 164.4 179.9C165.2 181.6 165.4 182.0 166.2 184.3C167.0 186.6 168.5 190.7 169.3 193.9C170.2 197.0 170.8 199.8 171.3 203.0C171.9 206.2 171.8 210.5 172.4 213.1C173.0 215.7 174.5 216.7 175.2 218.4C175.9 220.2 176.3 222.0 176.6 223.8C176.9 225.6 177.0 227.6 177.0 229.1C177.0 230.6 176.9 231.5 176.7 232.7C176.5 233.9 176.2 235.3 175.8 236.3C175.4 237.4 175.0 238.1 174.3 238.8C173.6 239.5 172.3 240.0 171.5 240.7C170.6 241.5 169.8 242.9 169.1 243.5C168.5 244.1 168.2 244.0 167.4 244.2C166.6 244.4 165.2 244.3 164.3 244.6C163.5 244.8 162.8 245.7 162.0 245.9C161.2 246.1 160.0 246.0 159.4 245.9C158.9 245.8 158.9 245.8 158.6 245.6C158.3 245.3 157.9 245.1 157.6 244.5C157.3 243.9 156.9 242.8 156.8 241.9C156.7 241.1 156.8 240.6 157.1 239.4C157.3 238.1 158.1 235.8 158.3 234.5C158.5 233.3 158.3 232.3 158.2 231.9C158.0 231.4 158.0 231.4 157.3 231.7C156.7 231.9 155.0 233.1 154.1 233.4C153.3 233.7 152.8 233.8 152.2 233.7C151.5 233.6 150.6 233.2 150.1 232.9C149.6 232.6 149.4 232.3 149.2 231.7C149.1 231.2 149.0 230.1 149.1 229.6C149.1 229.1 149.1 229.1 149.3 228.7C149.4 228.4 149.4 228.1 149.8 227.4C150.2 226.8 151.2 226.1 151.7 224.9C152.2 223.7 152.5 221.7 153.0 220.3C153.4 218.9 153.9 217.7 154.6 216.6C155.3 215.5 156.6 214.4 157.1 213.7C157.6 213.0 157.5 214.1 157.6 212.4C157.6 210.8 157.5 206.5 157.2 203.8C156.9 201.0 156.2 197.8 155.8 195.9C155.3 194.0 155.3 193.5 154.5 192.6C153.8 191.7 151.7 191.1 151.3 190.5C150.9 189.8 152.1 189.1 152.2 188.8";

/**
 * Limb hinges, for the rotation params.
 *
 * Rotating by 0° is the identity whatever the pivot, so the pivot is free to move without
 * touching the approved rest pose — but it is NOT free to sit wherever it looks right. It must be
 * a real joint INSIDE the body: the arm's root tapers out only a few units past the hinge, so a
 * hinge outside the silhouette swings that root clear of the body and the arm floats beside the
 * character with a white gap at the shoulder. (That is exactly what an earlier, more "outboard"
 * hinge did at raised angles.)
 *
 * The body's left edge is x ≈ 44.9 at y = 188, so (52, 188) sits ~7 units inside the contour;
 * from there the root stays under the body across the whole −45°…160° swing, and the shaft
 * crosses the contour, which is what makes the arm read as attached.
 */
export const PIVOT_ARM_L = { x: 52, y: 188 } as const;
export const PIVOT_ARM_R = { x: 148, y: 188 } as const;
export const PIVOT_LEG_L = { x: 85, y: 218 } as const;
export const PIVOT_LEG_R = { x: 115, y: 218 } as const;


/** Traced right flank, apex → widest point. */
const RIGHT_FLANK: readonly (readonly [number, number])[] = [
  [80.9, 55], [88.84, 58.5], [97.61, 63], [107.09, 69], [116.37, 76], [126.8, 85],
  [137.15, 96], [147.47, 110], [155.57, 126], [160.33, 142], [161.93, 153], [162.2, 157.8],
];
/** Traced left flank, widest point → apex. The 64.5/64.5/63.9 run at the top is the concave
 *  hollow under the curl; flatten it and the drop stops reading as a drop. */
const LEFT_FLANK: readonly (readonly [number, number])[] = [
  [37.8, 157.8], [38.4, 150], [39.9, 140], [43.39, 128], [48.46, 116], [54.43, 104],
  [60.1, 92], [63.35, 82], [64.5, 74.6], [64.5, 70.9], [63.9, 67.1], [64.9, 60.5],
];
/** The cap is ~9 units across, which rounds the apex to r ≈ 4.5. A narrower one is a needle. */
const TIP_R = [74.0, 53.8] as const;
const TIP_A = [68.8, 51.9] as const;
const TIP_L = [65.3, 57.0] as const;

/** Everything above this bends with the tip; the pivot is where the crown meets the body. */
const BEND_TOP_Y = 118;
const BEND_SPAN = 66;
const BEND_PIVOT = { x: 100, y: 120 } as const;
const BEND_MAX_DEG = 22;

/** Face landmarks, measured off the reference. The head leans left, so the face sits right of
 *  centre and the eye line tilts about −4° with the right eye higher. */
/** Eye whites are nearly round, and the two are not the same shape — the head leans. */
/**
 * Symmetric, not identical. Both eyes are the SAME ellipse — a friendly face reads as careless
 * the moment one eye is visibly rounder than the other — and the life comes from where they sit:
 * the eye line tilts with the head, so the right eye rides 4.5 units higher than the left. Both
 * are the same distance (22.6) from the face's axis at x = 108.8.
 */
export const EYE_RX = 14.5;
export const EYE_RY = 14.3;
export const FACE_AXIS_X = 108.83;
export const EYE_L = { x: 86.25, y: 139.0, rx: EYE_RX, ry: EYE_RY } as const;
export const EYE_R = { x: 131.4, y: 134.5, rx: EYE_RX, ry: EYE_RY } as const;
/**
 * Irises sit LOW and INNER, which is what aims the gaze at the viewer. One offset, mirrored, so
 * the two eyes converge on the same point instead of drifting apart.
 */
export const IRIS_INSET = 2.2;
export const IRIS_DROP = 2.5;
export const IRIS_L = { x: EYE_L.x + IRIS_INSET, y: EYE_L.y + IRIS_DROP } as const;
export const IRIS_R_C = { x: EYE_R.x - IRIS_INSET, y: EYE_R.y + IRIS_DROP } as const;
export const IRIS_R = 8.65;
/**
 * One weight scale for every line on the face, so nothing reads as drawn by a second hand.
 * The lid is the heavy line; the eye rim is half of it; the mouth sits between the two.
 */
export const FACE_W = { lid: 2.6, mouth: 2.1, rim: 1.2 } as const;
/** The glint pair, as offsets from the iris centre. Identical in both eyes. */
/** Kept inside the iris: 5.17 + 3.2 < IRIS_R, so the big glint never breaks the iris rim. */
export const GLINT = { bigX: 3.4, bigY: -3.9, bigR: 3.2, smallX: -4.2, smallY: 3.7, smallR: 1.15 } as const;
/** The irises are not quite round: measured off the reference, both are a touch taller than wide,
 *  and the right one noticeably so. */
export const IRIS_RX_L = 8.4;
export const IRIS_RY_L = 8.6;
export const IRIS_RX_R = 7.9;
export const IRIS_RY_R = 8.5;
/** Short, thick, and angled with the outer ends up — the reference's brows are heavy strokes,
 *  not hairlines, and they sit close above the eyes. */
export const BROW_L = { x: 79.6, y: 116.2, half: 9.75, tilt: -26.2 } as const;
export const BROW_R = { x: 129.15, y: 110.85, half: 9.75, tilt: 12.3 } as const;
export const BROW_W = 5;
/** Corners of the mouth, i.e. the TOP of its bounding box — the lips arc down from here. */
export const MOUTH = { x: 111.3, y: 158 } as const;
/** Below the smile, never inside it: at idle the floor of the mouth is at y = 170.8. */
export const CHIN = { x: 112, y: 179.5, half: 3.0 } as const;
export const CHEEK = {
  left: { x: 82.05, y: 159.35, rx: 9.25, ry: 4.35 },
  right: { x: 139.9, y: 151.85, rx: 8.3, ry: 4.65 },
} as const;
/** Max pupil travel. Small: a big one makes the eyes read as bulging. */
export const GAZE_RADIUS = 4;
export const MAX_SQUASH = 0.35;
export const OUTLINE_W = 1.8;
export const FOOT_Y_SOLE = 262.6;

/** Trim to two decimals so the path string stays short — it is rebuilt 60 times a second. */
function n(value: number): string {
  "worklet";
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

export interface Scale2 {
  scaleX: number;
  scaleY: number;
}

/**
 * Area-preserving squash and stretch. A blob that merely scales reads as a blob being scaled;
 * one that widens as it flattens reads as something with mass inside it.
 */
export function volumePreservingScale(squash: number): Scale2 {
  "worklet";
  const s = Math.max(-MAX_SQUASH, Math.min(MAX_SQUASH, Number.isFinite(squash) ? squash : 0));
  const scaleY = 1 - s;
  return { scaleX: 1 / scaleY, scaleY };
}

export interface Point {
  x: number;
  y: number;
}

/** Keep a gaze inside the pupil's circle of travel. */
export function clampGaze(x: number, y: number, radius: number = GAZE_RADIUS): Point {
  "worklet";
  const px = Number.isFinite(x) ? x : 0;
  const py = Number.isFinite(y) ? y : 0;
  const d = Math.sqrt(px * px + py * py);
  if (d <= radius || d === 0) return { x: px, y: py };
  return { x: (px / d) * radius, y: (py / d) * radius };
}

type P = readonly [number, number];

/** 0 at the body, 1 at the tip — how much of the bend a contour point takes. */
function bendWeight(y: number): number {
  "worklet";
  const t = Math.max(0, Math.min(1, (BEND_TOP_Y - y) / BEND_SPAN));
  return t * t * (3 - 2 * t);
}

/**
 * Deform one traced point by the tip pose. Stretch first (vertically, about the pivot), then
 * rotate about the same pivot, both faded in by `bendWeight` — so the crown swings and the body
 * does not, and the rest pose is the trace untouched.
 */
function bend(pt: P, curl: number, len: number, k: number, weight?: number): P {
  "worklet";
  // The three cap points share the apex's weight, so the cap swings as one rigid piece. Letting
  // each take its own weight folds the 5-unit cap over itself at anything past a gentle droop.
  const w = weight === undefined ? bendWeight(pt[1]) : weight;
  let x = pt[0];
  let y = BEND_PIVOT.y + (pt[1] - BEND_PIVOT.y) * (1 + (len - 1) * w);
  if (w > 0 && curl !== 0) {
    const a = (curl * BEND_MAX_DEG * w * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const dx = x - BEND_PIVOT.x;
    const dy = y - BEND_PIVOT.y;
    x = BEND_PIVOT.x + dx * ca - dy * sa;
    y = BEND_PIVOT.y + dx * sa + dy * ca;
  }
  return [BODY.cx + (x - BODY.cx) * k, BODY.cy + (y - BODY.cy) * k];
}

/**
 * Catmull-Rom through the given points, emitted as cubic segments. Endpoints are duplicated, which
 * makes the curve leave the first point and arrive at the last one along the chord — exactly what
 * is wanted where the flanks meet the base arc.
 */
function spline(pts: P[]): string {
  "worklet";
  let out = "";
  const m = pts.length;
  for (let i = 0; i < m - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < m ? pts[i + 2] : pts[m - 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    out += `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return out;
}

/**
 * The body: the traced contour, deformed by the tip pose and scaled by hydration, closed with the
 * real base-circle arc along the bottom.
 *
 * @param tipBend −1…1 — −1 droops the crown further left, +1 straightens it upright
 * @param tipLength 0.6…1.3 — crown reach
 * @param hydrationScale ~0.92…1 — whole-body scale about the base centre
 */
export function bodyPath(tipBend: number, tipLength: number, hydrationScale: number): string {
  "worklet";
  const curl = Math.max(-1, Math.min(1, Number.isFinite(tipBend) ? tipBend : 0));
  const len = Math.max(0.5, Math.min(1.4, Number.isFinite(tipLength) ? tipLength : 1));
  const k = Math.max(0.5, Math.min(1.5, Number.isFinite(hydrationScale) ? hydrationScale : 1));

  const capW = bendWeight(TIP_A[1]);
  const rchain: P[] = [bend(TIP_A, curl, len, k, capW), bend(TIP_R, curl, len, k, capW)];
  for (let i = 0; i < RIGHT_FLANK.length; i++) rchain.push(bend(RIGHT_FLANK[i], curl, len, k));
  const lchain: P[] = [];
  for (let i = 0; i < LEFT_FLANK.length; i++) lchain.push(bend(LEFT_FLANK[i], curl, len, k));
  lchain.push(bend(TIP_L, curl, len, k, capW));
  lchain.push(bend(TIP_A, curl, len, k, capW));

  const start = rchain[0];
  const R = BODY.r * k;
  const RY = BODY_RY * k;
  const arcEnd = lchain[0];

  return (
    `M${n(start[0])} ${n(start[1])}` +
    spline(rchain) +
    `A${n(R)} ${n(RY)} 0 1 1 ${n(arcEnd[0])} ${n(arcEnd[1])}` +
    spline(lchain) +
    "Z"
  );
}

/** Where the tip's apex currently is — the anchor for the cosmetic slot and the flicks. */
export function tipAnchor(tipBend: number, tipLength: number, hydrationScale: number): Point {
  "worklet";
  const curl = Math.max(-1, Math.min(1, Number.isFinite(tipBend) ? tipBend : 0));
  const len = Math.max(0.5, Math.min(1.4, Number.isFinite(tipLength) ? tipLength : 1));
  const k = Math.max(0.5, Math.min(1.5, Number.isFinite(hydrationScale) ? hydrationScale : 1));
  const p = bend(TIP_A, curl, len, k, bendWeight(TIP_A[1]));
  return { x: p[0], y: p[1] };
}

/** A slice of an ellipse as a polyline — used for the heavy upper-lid arc. */
export function arcPath(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): string {
  "worklet";
  const steps = 14;
  let out = "";
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a);
    out += `${i === 0 ? "M" : "L"}${n(x)} ${n(y)}`;
  }
  return out;
}

/** A capsule (stadium) between two points, for the long gloss streak. */
export function capsulePath(ax: number, ay: number, bx: number, by: number, width: number): string {
  "worklet";
  const r = Math.max(0.5, width / 2);
  let dx = bx - ax;
  let dy = by - ay;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= l;
  dy /= l;
  const px = -dy * r;
  const py = dx * r;
  return (
    `M${n(ax + px)} ${n(ay + py)}` +
    `L${n(bx + px)} ${n(by + py)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(bx - px)} ${n(by - py)}` +
    `L${n(ax - px)} ${n(ay - py)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(ax + px)} ${n(ay + py)}Z`
  );
}

const MIN_MOUTH_OPEN = 1.2;
/** The corner lift, capped so a wide mouth does not curl into a crescent. */
const MOUTH_CORNER = 1.5;

export interface MouthShape {
  halfWidth: number;
  open: number;
  curve: number;
}

/**
 * The mouth as one closed shape around its own origin — two quadratics, corner to corner. Filled,
 * not stroked: a stroke reads as a line drawn on a balloon.
 */
export function mouthPath({ halfWidth, open, curve }: MouthShape): string {
  "worklet";
  const w = Math.max(0, Number.isFinite(halfWidth) ? halfWidth : 0);
  const o = Math.max(MIN_MOUTH_OPEN, Number.isFinite(open) ? open : 0);
  const c = Number.isFinite(curve) ? curve : 0;
  const k = Math.min(MOUTH_CORNER, w * 0.17);
  // `open` is the depth of the mouth floor below the corner line. Solving the cubic's midpoint
  // for that depth keeps the number meaning the same thing at every width and curve.
  const y1 = (o + 0.25 * k) / 0.75;
  // The lower controls sit at 0.86 of the half-width — a wide spread, which is what makes the
  // floor a round U. Pull them in and the mouth comes to a point and reads as a shout.
  return (
    `M${n(-w)} ${n(-k)}` +
    `C${n(-w * 0.62)} ${n(c * 0.95)} ${n(w * 0.62)} ${n(c * 0.95)} ${n(w)} ${n(-k)}` +
    `C${n(w * 0.86)} ${n(y1)} ${n(-w * 0.86)} ${n(y1)} ${n(-w)} ${n(-k)}` +
    "Z"
  );
}

/** Where the upper lip dips lowest — the top of the opening, in mouth-local units. */
export function mouthLipY(halfWidth: number, curve: number): number {
  "worklet";
  const w = Math.max(0, Number.isFinite(halfWidth) ? halfWidth : 0);
  const c = Number.isFinite(curve) ? curve : 0;
  return 0.75 * c * 0.95 - 0.25 * Math.min(MOUTH_CORNER, w * 0.17);
}

/** The floor of the opening, in mouth-local units. */
export function mouthFloorY(open: number): number {
  "worklet";
  return Math.max(MIN_MOUTH_OPEN, Number.isFinite(open) ? open : 0);
}

/** One brow: a short thick stroke around its own origin, outer end raised. */
export function browPath(halfLen: number, arch: number, midW: number, endW: number): string {
  "worklet";
  // A filled lens, not a stroked bar: an arched brow that thins toward its ends reads friendly,
  // and a straight bar of constant weight reads angry no matter how it is angled.
  const h = Math.max(1, halfLen);
  const e = endW / 2;
  const m = midW / 2;
  return (
    `M${n(-h)} ${n(-e)}` +
    `Q0 ${n(-arch - m)} ${n(h)} ${n(-e)}` +
    `L${n(h)} ${n(e)}` +
    `Q0 ${n(-arch + m)} ${n(-h)} ${n(e)}` +
    "Z"
  );
}

/** A flying droplet flick — the little drops that spin off the tip. */
export function flickPath(size: number): string {
  "worklet";
  const w = Math.max(1, Number.isFinite(size) ? size : 5);
  return `M0 ${n(-w * 1.5)}C${n(w * 1.1)} ${n(-w * 0.3)} ${n(w)} ${n(w)} 0 ${n(w)}C${n(-w)} ${n(w)} ${n(-w * 1.1)} ${n(-w * 0.3)} 0 ${n(-w * 1.5)}Z`;
}

/** A random glance target, uniform over the disc. Not a worklet — it runs from a timer. */
export function saccadeTarget(radius: number = GAZE_RADIUS): Point {
  const r = radius * Math.sqrt(Math.random());
  const t = Math.random() * Math.PI * 2;
  return { x: r * Math.cos(t), y: r * Math.sin(t) };
}
