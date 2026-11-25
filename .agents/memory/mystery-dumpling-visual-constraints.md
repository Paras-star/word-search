---
name: Mystery Dumpling visual constraints
description: Non-negotiable visual-source rules for future Mystery Dumpling work.
---

Use only the supplied 30 dumpling artworks, exact catalog names and five supplied rarity tiers. The individually supplied PNGs for every rarity supersede all old combined sprite sheets. The Collection Room is a rarity-ordered, vertically scrolling gallery, not an illustrated map or shared environmental room.

**Why:** The user explicitly defined the supplied collectible artwork and catalog as authoritative, then replaced the environment with a clean gallery populated only by actual owned assets and locked placeholders.

**How to apply:** Reference the supplied individual assets without altering their designs. Effects may surround a dumpling but must not modify it. Animate only visible owned dumplings; never reintroduce the retired room image or illustrated map.

Preserve the supplied normal-reward rarity banners and image buttons exactly, including any opaque black pixels surrounding the banner artwork. Do not treat the black surround as permission to remove a background or substitute transparent artwork.

**Why:** The user explicitly requires the supplied artwork unchanged; the five normal-reward banner uploads are RGB images rather than transparent PNGs.

**How to apply:** Use the original uploaded assets at their actual locations and adjust only their layout and overlaid catalog-name text. Any artwork cleanup requires separate approval.

Verify complete rarity-banner names in a real narrow browser, not only with mocked layout checks or React Native's automatic text fitting.

**Why:** React Native Web left long uppercase names ellipsized despite `adjustsFontSizeToFit`; a layout calculation using average lowercase glyph widths passed unit tests but underestimated the rendered bold text and letter spacing.

**How to apply:** Budget for uppercase glyph widths, tracking and padding explicitly, and confirm the full names in actual phone-width and desktop screenshots. Keep text inside the banner's central panel, clear of its emblem and leaves.

Keep all three supplied Treasure Chest PNGs unchanged, including their transparency, and preserve the Home chest icon. For opening/reveal visuals, the supplied chest-opening video now supersedes the still PNGs as the authoritative animation source.

**Why:** The user subsequently required the exact video's chest, motion, effects and sound, while explicitly preserving the other artwork and Home experience.

**How to apply:** Isolate only the chest/effects/audio; exclude its watermark and black backdrop. Use native rendering, not an entire-video player. Keep the source PNGs intact and share opening visuals without merging paid/free reward logic.

The chest remains visibly open, with the unchanged awarded dumpling revealed inside it. The chest itself is tapped; no separate opening button. A paid chest tap requires the 700-coin confirmation, while the puzzle reward remains free.

**Why:** The latest instructions explicitly supersede the previous mutually-exclusive reveal.

**How to apply:** Keep the chest around/under the dumpling and occlude its lower body with the front rim. Never replace the chest or float the collectible above it. Use the extracted opening audio, not the older opening/reveal cues; retain the other original audio and transaction safeguards.

Use the existing 700-coin chest presentation as the positioning reference for every level-completion chest, including future categories. Align the chest to the artwork's circular pedestal rather than the screen center.

**Why:** The user requires the same horizontal/vertical alignment, scale, proportions, and chest-to-circle relationship across Android screen sizes.

**How to apply:** Share artwork-space layout and scenery only. Keep the existing opening animation intact and the free reward flow separate from paid purchase behavior.

The Collection Room uses the supplied adventure rarity panels over the existing night forest. Preserve each rarity's own emblem, colors, ornamental border and transparent exterior; never substitute the Epic emblem for another tier.

**Why:** The user made the five uploaded rarity panel designs authoritative and requires a separate pedestal space for every existing collectible: Legendary 2, Epic 4, Rare 5, Uncommon 7, Common 12.

**How to apply:** Reconstruct baked-in display areas instead of stretching a three-slot image or covering old pedestals. Keep the rarity-ordered scrolling gallery, live collection counts, original individual dumpling art, locked placeholders and `???` labels.