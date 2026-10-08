# Toy Box UI artwork

## Replacing Home artwork (2026-10-05)

The user's replacements for `home-rivals.png`, `home-robot.png`, `home-army.png` and `ripsy-toy-logo.png` are the runtime source files. Do not restore the older generated versions. After replacing the logo or splash background, run `npm run assets:sync -w @rps/mobile` from the repository root. This copies the exact original bytes into the iOS asset catalog; iOS run/upload scripts do it automatically. `npm run assets:check -w @rps/mobile` and release preflight check synchronized native copies and the seven 8 x 256 gradient ramps. Never replace `home-gradient-*.png` with logo/character art.

Home renders the hero in its original 3:2 ratio using the actual capped content width, with the logo contained in an 84 pt header slot. `home-portrait.tsx` shares head crops from the replacement hero between Home and the battle HUD; adjust those crop coordinates when changing the scene composition, not the game figures. Menu icons remain contained in fixed button bounds.

Startup waits for both local splash images' `onLoadEnd` (success or failure) as well as navigation restoration before removing the splash. This avoids pending native image callbacks applying splash art to recycled Home image views. There is no minimum branding delay; a 1500 ms watchdog prevents a missing callback from blocking navigation. The original replacement files remain unchanged.

These original bitmap backdrops were generated with OpenAI's built-in image generation tool on 2026-10-01. They intentionally contain no UI text, logos, characters, or copied game assets. React Native renders the real RIPSY logo, RIPSY 001/Seeker fighter sprites, controls, accessibility labels, and board interaction above them.

## Illustrated startup splash — 2026-10-04

`splash-playground-v1.png` is original artwork generated with OpenAI's built-in `image_gen` tool. Actual output is **887 × 1774 px**. It contains decorative blue/coral toy ninja mascots, sky and castles, but no text or logo. These are splash mascots, not new playable or purchasable figure variants. Native iOS and React Native separately overlay the unchanged `ripsy-toy-logo.png`; Android's system splash retains its app icon on the matching cyan background.

The same background file is copied unchanged to `ios/RipsyMobile/Images.xcassets/SplashArtwork.imageset/splash-artwork.png`. The same original logo is copied unchanged to `SplashLogo.imageset/splash-logo.png`. When replacing artwork, update both copies. Render with aspect-fill/cover, not stretch; keep safe-area-aware logo and loading positions in `src/components/startup-splash.tsx` consistent with the storyboard. Loading ends when restoration actually finishes; there is no branding delay.

Final generation prompt (requested resolution is a prompt target; actual output dimensions are above):

> Use case: stylized-concept. Asset type: original production splash-screen background illustration for the RIPSY mobile game, tall portrait 1024x2048, not a UI mockup and not inside a phone. Style: premium playful Toy Box game art, rounded glossy molded-plastic/clay 3D toys, soft polished lighting, bright cyan sky, fluffy white clouds, warm golden block castles with turquoise turrets and small coral triangular flags, lush rounded grassy scenery. Subject: two friendly rival ninja toy mascots with oversized heads, simple expressive amber eye openings and black face masks, chunky hands, small yellow belt buckles, blue ninja on left and coral-red ninja on right. Full bodies visible in a playful lively face-off pose, blue ninja showing a round rock fist, red ninja showing two fingers for scissors. Same cute tactile visual language as a colorful casual tabletop strategy game, no realistic combat or weapons. Composition: designed for edge-to-edge phone launch screens with portrait center-crop. Keep both mascots and their hands entirely within the central 60% of image width and between 42% and 73% of image height. Leave the upper 20%-38% of the canvas as clean bright open sky, reserved for an EXISTING logo added separately. Leave lower 15% calmly lit grass/sand with uncluttered room for a separate loading message. Castles frame the middle-distance sides; characters are the focal point, readable silhouettes, celebratory energetic game mood. Colors: sky cyan #79D8F6, toy blue, coral red #FF654F, reward yellow #FFC928, dark navy masks. No text, no letters, no logo, no loading bar, no UI controls, no border, no watermark. This is new background artwork, not a redesign of the established RIPSY logo or playable figures.

## `toy-box-home-arena.png`

Final prompt:

> Use case: stylized-concept. Asset type: production mobile-game home hero background for RIPSY. The supplied three-screen game UI concept is a style and quality reference only; do not copy its characters, layout, logo, text, or branded elements. Create an original polished toy-box battle-arena backdrop that makes the existing RIPSY home screen feel like a premium playful mobile game. Bright cyan sky with soft dimensional clouds, cheerful toy grass hills, two small chunky sandcastle towers with coral flags on the far left and far right, and a warm sand play platform across the bottom. High-quality stylized 3D mobile-game illustration, chunky molded-plastic forms, soft global illumination, tactile rounded materials, vibrant but controlled. Wide landscape 3:2, symmetrical, with a large completely clear central area for two existing character sprites and a VS badge and clear upper-center negative space for a code-rendered RIPSY logo. Scenery stays at far edges and along the bottom. Sky cyan, warm cream and sand, coral red accents, reward yellow, deep navy details, fresh green. Background art only; absolutely no text, letters, logo, UI buttons, people, characters, weapons, or watermarks. Do not resemble Candy Crush assets or trade dress. Original RIPSY toy-arena aesthetic.

## `toy-box-battle-board.png`

Final prompt:

> Use case: stylized-concept. Asset type: production square battle-board background for a mobile strategy game. The supplied three-screen game UI concept is a style and quality reference only; do not copy its characters, layout, logo, text, or branded elements. Create an original top-down toy-box battlefield board for RIPSY. A perfectly square warm sand play board with exactly seven columns and seven rows, framed by thick rounded molded sand blocks. Fresh green grass surrounds the outside. Small chunky toy trees, smooth gray rocks, two tiny coral flags, and a few wooden toy crates decorate only the outer grass perimeter. Premium stylized 3D mobile-game illustration, orthographic top-down camera, soft global illumination, tactile rounded plastic/clay materials, crisp readable cell grid. Centered square board, straight-on top-down with no perspective distortion. Every cell is fully visible and equal-sized. Decorations remain strictly outside the grid and never overlap a cell. Warm cream and sand checkerboard, reward yellow highlights, cyan sky reflections, coral flags, deep navy shadows, fresh green grass. Empty board only; exactly 7x7 cells; absolutely no text, letters, logo, UI, characters, weapons, or watermarks. No decoration may cover or enter any playable cell. Original RIPSY toy-arena aesthetic.

Legacy asset, no longer used by the native battle screen. Its illustrated grid occupied a centered 70% square. Do not combine its baked grid with the new 84% native geometry.

## Illustrated Home assets — 2026-10-02

Generated with OpenAI's built-in `image_gen` tool using the user's supplied three-phone concept as a style/composition reference. The reference's **left Home screen** is the target. These mascots and menu icons are decorative illustrations; they do not change fig1/fig2 gameplay assets, collectible ownership, or weapon state. The images contain no rendered interactive UI: every button, room input, game card, and settings control is native and accessible.

### `home-rivals.png`

Final prompt:

> Use case: stylized-concept. Asset type: final production hero illustration for a React Native mobile game home screen, NOT a screenshot or UI mockup. Reference image is the attached three-phone RIPSY concept; match the illustrated scene of the LEFT phone only. Generate a polished wide 3:2 illustration: bright cyan sky, soft white toy clouds, chunky turquoise sandcastle towers at far left and right with small coral flags, warm yellow sand walls and fresh green hills. Two original playful chunky 3D ninja toy fighters in the lower half: blue ninja on left showing a raised rock/fist hand, coral-red ninja on right showing two fingers in a scissors gesture; black face masks, expressive pale tan eye area, friendly competitive expressions, molded-plastic rounded surfaces, studio-quality soft light, beautiful highly dimensional mobile-game artwork. Characters waist-up occupy bottom 55%, heads at roughly 52% height, cropped by bottom edge at waist. Leave upper center 40% of image entirely clear sky for a separately rendered logo and the corners clear for profile/settings controls. Full-bleed scenery, no frame, no phone, no cards, no buttons, no text, no letters, no watermarks. Match the quality, color, proportions and composition of the provided LEFT home screen, avoid flat vector look.

### `ripsy-toy-logo.png`

Final prompt (true transparent background):

> Use case: logo-brand. Asset type: final mobile game header logo asset on true transparent background. Reference attached three-phone image LEFT home screen logo only. Create the exact word RIPSY (R I P S Y), five chunky rounded friendly letters, cheerful dimensional 3D toy-game wordmark, yellow golden front faces, subtle cream-white edge highlights, warm orange beveled sides, deep orange dimensional bottom extrusion and soft contact shadow. The word curves playfully upwards with slightly varied tilted letters, exceptionally legible at 160 pixels wide. Tiny shiny golden crown above the I. Match the provided left-screen wordmark as closely as possible. Straight-on view, wide 2.5:1 composition, logo fills frame with tiny clear margin. Fully transparent background. No phone, no panels, no other text, no backdrop, no border, no watermark.

### Menu sprites

`home-swords.png`, `home-robot.png`, `home-players.png`, `home-army.png`, `home-shop.png`, `home-settings.png`: generated together as a 1254 × 1254 transparent atlas, split into six equal cells (418 × 627), trimmed and resized to a maximum 256 px edge with Sharp. Alpha is preserved. Original atlas remains in the image-generation output; all six runtime assets are saved in this directory.

Final prompt:

> Use case: stylized-concept. Asset type: production sprite atlas of six game menu icons on TRUE TRANSPARENT background. Original polished dimensional toy-game icons, match the RIPSY reference left phone. Canvas square, EXACTLY 3 columns by 2 rows equal-sized cells, each icon centered within its cell with wide transparent margins, no dividers. Top row left: two crossed chunky navy-blue swords with cyan highlights. Top row middle: cute rounded dark-navy robot head with antenna, white glowing eyes and smile. Top row right: two rounded dark-navy player silhouettes, a small person in front of a taller person. Bottom row left: tan-armored toy ninja fighter with black mask and expressive eyes on a tiny rounded tan plinth, full body. Bottom row middle: chunky gold-and-coral treasure chest/shop icon with blue keyhole, closed lid. Bottom row right: white chunky gear cog with navy-blue shading and central hole. Cohesive 3D mobile game art, smooth beveled tactile surfaces, soft shadows, strong silhouettes, legible at 44 pixels. Each icon entirely isolated and fits inside inner 65% of its cell, no overlap between cells. No text, no letters, no numbers, no background, no panels, no buttons, no watermark.

### `home-gradient-*.png`

These seven 8 × 256 color ramps are code-generated with `node scripts/create-home-gradients.mjs`, not AI imagery. Native `Image` stretching gives buttons/panels a seamless gradient without a new dependency. Keep text, bevels, borders, press feedback and hit targets in `toy-home-controls.tsx`.

## Illustrated Battle — 2026-10-02

Generated/edited with OpenAI's built-in `image_gen` using the user's three-phone concept as a style reference, targeting the **right Battle screen**. All runtime files are saved in this directory. The actual fighters remain fig1/fig2 Rive instances; illustrated HUD portraits reuse `home-rivals.png` and are decoration only. Native code renders all 49 cells, controls, clocks, turn status and accessibility. No illustrated scenery is a gameplay obstacle.

### `battle-playground.png`

Final generation prompt:

> Use case: stylized-concept. Asset type: production PORTRAIT mobile game battle-screen BACKGROUND, 2:3 aspect ratio. Input reference is style only: use the RIGHT phone's sunny toy-world scenery, not its UI. Polished chunky 3D molded toy / clay illustration. Top 40% clear bright cyan-blue sky with a few soft white puffy clouds; at 36% a low distant row of small teal and golden toy castle parapets and one coral triangular flag on each edge; bottom 64% lush fresh light green grass with tiny smooth stones and rounded bushes ONLY along extreme left and right edge. Central 80% deliberately calm and open, no trees, no buildings in foreground, no board: a native interactive square battlefield will be placed over it. Soft sunlight and tactile bevels, same cheerful cyan/cream/coral palette as reference. Fill entire image. No characters, game pieces, boards, grids, UI, letters, words, numerals, logo, phone, watermark or white outer border.

### `battle-toy-frame-v2.png` (runtime), `battle-toy-frame.png` (first draft)

First generation prompt:

> Use case: stylized-concept. Asset type: production SQUARE game-board frame illustration, not a screenshot. Match the toy battlefield aesthetic of the RIGHT phone in the attached RIPSY concept. Straight-on orthographic TOP-DOWN square, no perspective: a warm golden sand-and-stone board frame surrounded by a very narrow fresh green grass perimeter. The central EXACT 84% square must be a completely blank uniform pale cream sand surface, centered, straight edges, fully empty. No grid or markings inside: the real seven-by-seven interactive tile grid will be drawn in native code over the center. Raised chunky golden sand-block rails immediately around this central square; thin grass border outside the rails. A small rounded gray toy turret with a coral flag at each upper outer corner; a few tiny tactile green shrubs and smooth rocks along the outer perimeter ONLY. Premium polished 3D mobile-game art, soft sunny light, molded toy/clay forms, crisp top-down geometry and beveled warm stone, subtle shadows. Decorations stay strictly in outer 8% margin, never enter central 84%. Board fills image, narrow perimeter, no large landscape margin, no white frame. Absolutely no characters, weapons, trees/rocks/crates inside the central playing area, letters, numbers, UI, text, phone or watermarks. Image reference is style only; do not reproduce obstacles shown in playable cells.

The first draft's aperture was smaller than requested. It was visually inspected, then edited to a thinner frame rather than zooming/cropping its flags. Final edit prompt:

> Use case: precise-object-edit. Edit the supplied square toy board frame for production game use. KEEP the exact material, lighting, textures, palette, top-down straight-on square geometry, gray corner turrets, coral flags and grass aesthetic. Change ONLY proportions: ENLARGE the blank central sand area to occupy exactly the centered 84% square of the entire image (left edge x=8%, right x=92%, top y=8%, bottom y=92%). All rails, turrets, shrubs, stones and flags must fit in outer 8% perimeter, not inside center. Make rails much thinner, HALF current thickness, grass margin extremely narrow. Small flags must remain wholly within image, no clipping. Remove central top and bottom protruding battlements if necessary to get an exact straight uniform frame around center. The central sand is completely blank, no grid, cells, characters, weapons, letters or UI. Need narrow board framing so actual 7x7 game pieces can render larger in code. No perspective. Square image, fills canvas.

The inspected final blank aperture is slightly wider than 84%, so the centered 84% native grid fits safely inside it. Keep `BOARD_PLAYABLE_RATIO = 0.84`; the image itself is never zoomed. Tiles and hit targets share exactly the same origin and dimensions. Only the image frame is clipped; animated figures can overflow freely.

## Illustrated Your Army — 2026-10-02

### `army-wood-tray.png`

Original wooden organizer backdrop generated with OpenAI's built-in `image_gen` tool, 1536 × 1024. Saved directly here for `army-screen.tsx`; the tray illustration is decorative and non-interactive. The native screen overlays exactly fourteen selectable slots in two rows of seven, uses the actual `assets/shop/fig1.png` and `fig2.png` Idle/NoWeapon exports, and renders all text, selection highlights and controls in code. No new playable characters or invented NFTs. The screen reuses `battle-playground.png` behind the tray. A bounds-constrained, padding-free image wrapper stretches the blank wooden panel to the tray; do not rely on intrinsic PNG dimensions for absolute layout.

Final prompt (transparent background requested):

> Use case: stylized-concept. Asset type: production game UI background texture for RIPSY Your Army selection tray. Create ONE wide 3:2 rounded rectangular pale honey wooden toy organizer panel, orthographic straight-on front view, perfectly flat undistorted face, soft chunky carved bevel around outer rim with cream edge highlights and subtle darker warm tan bottom extrusion. Entire interior is a completely empty uninterrupted smooth light blond wooden surface with delicate subtle wood grain, plenty of quiet space for native UI to overlay its title and 14 separate cells. Premium cheerful toy-box mobile-game 3D illustration, sunny soft global illumination, rounded tactile wood material, restrained texture. Panel fills almost all canvas with only a tiny transparent margin, fully isolated on TRUE transparent background. No slots or compartments, no grid, no dividers, no figurines, no objects, no buttons, no text, no letters, no digits, no logo, no watermark, no scenery. This is a reusable blank wooden UI panel, not a phone screenshot or a finished screen.
